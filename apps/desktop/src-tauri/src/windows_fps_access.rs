const FPS_HELPER_FLAG: &str = "--lumatrace-enable-fps-access";
const PERFORMANCE_LOG_USERS_SID: &str = "S-1-5-32-559";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsFpsAccessStatus {
    pub supported: bool,
    pub state: String,
    pub ready: bool,
    pub configured: bool,
    pub requires_sign_out: bool,
    pub can_enable: bool,
    pub detail_code: Option<String>,
}

impl WindowsFpsAccessStatus {
    #[cfg(not(windows))]
    fn unsupported() -> Self {
        Self {
            supported: false,
            state: "unsupported".into(),
            ready: false,
            configured: false,
            requires_sign_out: false,
            can_enable: false,
            detail_code: None,
        }
    }

    fn from_membership(ready: bool, configured: bool) -> Self {
        let state = if ready {
            "ready"
        } else if configured {
            "restart_required"
        } else {
            "needs_setup"
        };
        Self {
            supported: true,
            state: state.into(),
            ready,
            configured,
            requires_sign_out: configured && !ready,
            can_enable: !configured,
            detail_code: None,
        }
    }

    fn error(detail_code: &str) -> Self {
        Self {
            supported: true,
            state: "error".into(),
            ready: false,
            configured: false,
            requires_sign_out: false,
            can_enable: false,
            detail_code: Some(detail_code.into()),
        }
    }
}

pub fn get_status() -> WindowsFpsAccessStatus {
    platform::get_status()
}

pub async fn enable_for_current_user() -> Result<WindowsFpsAccessStatus, String> {
    tauri::async_runtime::spawn_blocking(platform::enable_for_current_user)
        .await
        .map_err(|error| format!("fps_access_helper_join_failed:{error}"))?
}

pub fn try_run_elevated_helper() -> Option<i32> {
    let mut args = std::env::args();
    let _executable = args.next();
    if args.next().as_deref() != Some(FPS_HELPER_FLAG) {
        return None;
    }
    let Some(user_sid) = args.next() else {
        return Some(64);
    };
    if args.next().is_some() || !is_valid_user_sid_argument(&user_sid) {
        return Some(64);
    }
    Some(
        match platform::add_sid_to_performance_log_users(&user_sid) {
            Ok(()) => 0,
            Err(_) => 1,
        },
    )
}

fn is_valid_user_sid_argument(value: &str) -> bool {
    value.len() >= 7
        && value.len() <= 184
        && value.starts_with("S-1-")
        && value
            .bytes()
            .all(|character| character.is_ascii_digit() || character == b'-' || character == b'S')
}

#[cfg(not(windows))]
mod platform {
    use super::WindowsFpsAccessStatus;

    pub fn get_status() -> WindowsFpsAccessStatus {
        WindowsFpsAccessStatus::unsupported()
    }

    pub fn enable_for_current_user() -> Result<WindowsFpsAccessStatus, String> {
        Err("fps_access_unsupported_platform".into())
    }

    pub fn add_sid_to_performance_log_users(_user_sid: &str) -> Result<(), String> {
        Err("fps_access_unsupported_platform".into())
    }
}

#[cfg(windows)]
mod platform {
    use std::{
        ffi::OsStr,
        mem::{size_of, zeroed},
        os::windows::ffi::OsStrExt,
        ptr::{null, null_mut},
    };

    use windows_sys::{
        core::PWSTR,
        Win32::{
            Foundation::{
                CloseHandle, GetLastError, LocalFree, ERROR_CANCELLED, ERROR_INSUFFICIENT_BUFFER,
                ERROR_MEMBER_IN_ALIAS, ERROR_MORE_DATA, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
            },
            NetworkManagement::NetManagement::{
                NERR_Success, NetApiBufferFree, NetLocalGroupAddMembers, NetLocalGroupGetMembers,
                LOCALGROUP_MEMBERS_INFO_0, MAX_PREFERRED_LENGTH,
            },
            Security::{
                Authorization::{ConvertSidToStringSidW, ConvertStringSidToSidW},
                CheckTokenMembership, EqualSid, GetTokenInformation, LookupAccountSidW,
                SidTypeAlias, SidTypeUser, TokenUser, PSID, TOKEN_QUERY, TOKEN_USER,
            },
            System::Threading::{
                GetCurrentProcess, GetExitCodeProcess, OpenProcessToken, WaitForSingleObject,
            },
            UI::{
                Shell::{
                    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS,
                    SHELLEXECUTEINFOW,
                },
                WindowsAndMessaging::SW_HIDE,
            },
        },
    };

    use super::{
        is_valid_user_sid_argument, WindowsFpsAccessStatus, FPS_HELPER_FLAG,
        PERFORMANCE_LOG_USERS_SID,
    };

    const HELPER_TIMEOUT_MS: u32 = 120_000;

    struct OwnedHandle(HANDLE);

    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
    }

    struct LocalSid(PSID);

    impl Drop for LocalSid {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    LocalFree(self.0);
                }
            }
        }
    }

    fn wide(value: &OsStr) -> Vec<u16> {
        value.encode_wide().chain(Some(0)).collect()
    }

    fn wide_string(value: &str) -> Vec<u16> {
        wide(OsStr::new(value))
    }

    fn sid_from_string(value: &str) -> Result<LocalSid, String> {
        let value = wide_string(value);
        let mut sid: PSID = null_mut();
        if unsafe { ConvertStringSidToSidW(value.as_ptr(), &mut sid) } == 0 || sid.is_null() {
            return Err(format!("sid_parse_failed:{}", unsafe { GetLastError() }));
        }
        Ok(LocalSid(sid))
    }

    fn current_user_sid_string() -> Result<String, String> {
        let mut token: HANDLE = null_mut();
        if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
            return Err(format!("token_open_failed:{}", unsafe { GetLastError() }));
        }
        let token = OwnedHandle(token);
        let mut required = 0u32;
        unsafe {
            GetTokenInformation(token.0, TokenUser, null_mut(), 0, &mut required);
        }
        if required == 0 || unsafe { GetLastError() } != ERROR_INSUFFICIENT_BUFFER {
            return Err("token_user_size_failed".into());
        }
        let mut buffer = vec![0u8; required as usize];
        if unsafe {
            GetTokenInformation(
                token.0,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                required,
                &mut required,
            )
        } == 0
        {
            return Err(format!("token_user_read_failed:{}", unsafe {
                GetLastError()
            }));
        }
        let token_user = unsafe { &*(buffer.as_ptr().cast::<TOKEN_USER>()) };
        let mut sid_text: PWSTR = null_mut();
        if unsafe { ConvertSidToStringSidW(token_user.User.Sid, &mut sid_text) } == 0
            || sid_text.is_null()
        {
            return Err(format!("sid_string_failed:{}", unsafe { GetLastError() }));
        }
        let length = unsafe {
            let mut length = 0usize;
            while *sid_text.add(length) != 0 {
                length += 1;
            }
            length
        };
        let result =
            String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(sid_text, length) });
        unsafe {
            LocalFree(sid_text.cast());
        }
        if !is_valid_user_sid_argument(&result) {
            return Err("sid_string_invalid".into());
        }
        Ok(result)
    }

    fn lookup_account_name(sid: PSID) -> Result<(Vec<u16>, i32), String> {
        let mut name_length = 0u32;
        let mut domain_length = 0u32;
        let mut usage = 0i32;
        unsafe {
            LookupAccountSidW(
                null(),
                sid,
                null_mut(),
                &mut name_length,
                null_mut(),
                &mut domain_length,
                &mut usage,
            );
        }
        if name_length == 0 {
            return Err(format!("account_lookup_size_failed:{}", unsafe {
                GetLastError()
            }));
        }
        let mut name = vec![0u16; name_length as usize];
        let mut domain = vec![0u16; domain_length.max(1) as usize];
        if unsafe {
            LookupAccountSidW(
                null(),
                sid,
                name.as_mut_ptr(),
                &mut name_length,
                domain.as_mut_ptr(),
                &mut domain_length,
                &mut usage,
            )
        } == 0
        {
            return Err(format!("account_lookup_failed:{}", unsafe {
                GetLastError()
            }));
        }
        Ok((name, usage))
    }

    fn performance_log_users_group_name(group_sid: PSID) -> Result<Vec<u16>, String> {
        let (name, usage) = lookup_account_name(group_sid)?;
        if usage != SidTypeAlias {
            return Err("performance_log_users_sid_not_alias".into());
        }
        Ok(name)
    }

    fn is_active_member(group_sid: PSID) -> Result<bool, String> {
        let mut is_member = 0;
        if unsafe { CheckTokenMembership(null_mut(), group_sid, &mut is_member) } == 0 {
            return Err(format!("membership_check_failed:{}", unsafe {
                GetLastError()
            }));
        }
        Ok(is_member != 0)
    }

    fn is_directly_configured(user_sid: PSID, group_name: &[u16]) -> Result<bool, String> {
        let mut resume = 0usize;
        loop {
            let mut buffer: *mut u8 = null_mut();
            let mut entries_read = 0u32;
            let mut total_entries = 0u32;
            let status = unsafe {
                NetLocalGroupGetMembers(
                    null(),
                    group_name.as_ptr(),
                    0,
                    &mut buffer,
                    MAX_PREFERRED_LENGTH,
                    &mut entries_read,
                    &mut total_entries,
                    &mut resume,
                )
            };
            if status != NERR_Success && status != ERROR_MORE_DATA {
                return Err(format!("group_members_read_failed:{status}"));
            }
            let found = if buffer.is_null() {
                false
            } else {
                let entries = unsafe {
                    std::slice::from_raw_parts(
                        buffer.cast::<LOCALGROUP_MEMBERS_INFO_0>(),
                        entries_read as usize,
                    )
                };
                entries
                    .iter()
                    .any(|entry| unsafe { EqualSid(entry.lgrmi0_sid, user_sid) } != 0)
            };
            if !buffer.is_null() {
                unsafe {
                    NetApiBufferFree(buffer.cast());
                }
            }
            if found {
                return Ok(true);
            }
            if status == NERR_Success {
                return Ok(false);
            }
        }
    }

    fn status_result() -> Result<WindowsFpsAccessStatus, String> {
        let user_sid = sid_from_string(&current_user_sid_string()?)?;
        let group_sid = sid_from_string(PERFORMANCE_LOG_USERS_SID)?;
        let group_name = performance_log_users_group_name(group_sid.0)?;
        let ready = is_active_member(group_sid.0)?;
        let configured = ready || is_directly_configured(user_sid.0, &group_name)?;
        Ok(WindowsFpsAccessStatus::from_membership(ready, configured))
    }

    pub fn get_status() -> WindowsFpsAccessStatus {
        status_result().unwrap_or_else(|error| {
            let detail_code = error.split(':').next().unwrap_or("fps_access_check_failed");
            WindowsFpsAccessStatus::error(detail_code)
        })
    }

    pub fn enable_for_current_user() -> Result<WindowsFpsAccessStatus, String> {
        let initial = status_result()?;
        if initial.ready || initial.configured {
            return Ok(initial);
        }
        let user_sid = current_user_sid_string()?;
        run_elevated_helper(&user_sid)?;
        status_result()
    }

    fn run_elevated_helper(user_sid: &str) -> Result<(), String> {
        if !is_valid_user_sid_argument(user_sid) {
            return Err("fps_access_invalid_current_user_sid".into());
        }
        let executable =
            std::env::current_exe().map_err(|_| "fps_access_executable_not_found".to_string())?;
        let executable = wide(executable.as_os_str());
        let verb = wide_string("runas");
        let parameters = wide_string(&format!("{FPS_HELPER_FLAG} {user_sid}"));
        let mut execute_info: SHELLEXECUTEINFOW = unsafe { zeroed() };
        execute_info.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
        execute_info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI;
        execute_info.lpVerb = verb.as_ptr();
        execute_info.lpFile = executable.as_ptr();
        execute_info.lpParameters = parameters.as_ptr();
        execute_info.nShow = SW_HIDE;

        if unsafe { ShellExecuteExW(&mut execute_info) } == 0 {
            let error = unsafe { GetLastError() };
            return if error == ERROR_CANCELLED {
                Err("fps_access_uac_cancelled".into())
            } else {
                Err(format!("fps_access_launch_failed:{error}"))
            };
        }
        if execute_info.hProcess.is_null() {
            return Err("fps_access_helper_handle_missing".into());
        }
        let process = OwnedHandle(execute_info.hProcess);
        match unsafe { WaitForSingleObject(process.0, HELPER_TIMEOUT_MS) } {
            WAIT_OBJECT_0 => {}
            WAIT_TIMEOUT => return Err("fps_access_helper_timeout".into()),
            other => return Err(format!("fps_access_helper_wait_failed:{other}")),
        }
        let mut exit_code = 1u32;
        if unsafe { GetExitCodeProcess(process.0, &mut exit_code) } == 0 {
            return Err(format!("fps_access_helper_exit_read_failed:{}", unsafe {
                GetLastError()
            }));
        }
        if exit_code != 0 {
            return Err(format!("fps_access_helper_failed:{exit_code}"));
        }
        Ok(())
    }

    pub fn add_sid_to_performance_log_users(user_sid: &str) -> Result<(), String> {
        if !is_valid_user_sid_argument(user_sid) {
            return Err("fps_access_invalid_user_sid".into());
        }
        let user_sid = sid_from_string(user_sid)?;
        let (_, usage) = lookup_account_name(user_sid.0)?;
        if usage != SidTypeUser {
            return Err("fps_access_sid_is_not_user".into());
        }
        let group_sid = sid_from_string(PERFORMANCE_LOG_USERS_SID)?;
        let group_name = performance_log_users_group_name(group_sid.0)?;
        let member = LOCALGROUP_MEMBERS_INFO_0 {
            lgrmi0_sid: user_sid.0,
        };
        let status = unsafe {
            NetLocalGroupAddMembers(
                null(),
                group_name.as_ptr(),
                0,
                (&member as *const LOCALGROUP_MEMBERS_INFO_0).cast(),
                1,
            )
        };
        if status == NERR_Success || status == ERROR_MEMBER_IN_ALIAS {
            Ok(())
        } else {
            Err(format!("fps_access_group_add_failed:{status}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{is_valid_user_sid_argument, WindowsFpsAccessStatus};

    #[test]
    fn only_accepts_sid_shaped_helper_arguments() {
        assert!(is_valid_user_sid_argument("S-1-5-21-1000"));
        assert!(!is_valid_user_sid_argument("S-1-5-21-1000 --other"));
        assert!(!is_valid_user_sid_argument("Administrator"));
        assert!(!is_valid_user_sid_argument("s-1-5-21-1000"));
    }

    #[test]
    fn maps_configured_but_inactive_membership_to_restart_required() {
        let status = WindowsFpsAccessStatus::from_membership(false, true);
        assert_eq!(status.state, "restart_required");
        assert!(status.requires_sign_out);
        assert!(!status.ready);
        assert!(!status.can_enable);
    }

    #[cfg(windows)]
    #[test]
    fn reads_the_current_windows_membership_without_elevation() {
        let status = super::platform::get_status();
        assert!(status.supported);
        assert!(matches!(
            status.state.as_str(),
            "ready" | "needs_setup" | "restart_required" | "error"
        ));
    }
}
