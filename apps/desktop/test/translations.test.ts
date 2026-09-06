import { beforeAll, describe, expect, it } from "vitest";
import englishJson from "../src/i18n/locales/en-US.json";
import { localeCatalog } from "../src/i18n/localeCatalog";
import {
  defaultTranslations,
  loadTranslations,
  localeEnglishNames,
  localeLabels,
  locales,
  zhCNOverrides,
  type TranslationDictionary,
  type TranslationKey
} from "../src/i18n/translations";

const chineseDashboardKeys = [
  "app.tagline",
  "nav.dashboard",
  "status.serverReady",
  "status.localConnection",
  "status.localData",
  "common.quickStart",
  "dashboard.title",
  "dashboard.subtitle",
  "dashboard.localServer",
  "dashboard.devices",
  "dashboard.recentSessions",
  "guide.title",
  "guide.subtitle",
  "guide.primaryAction",
  "guide.realBadge",
  "guide.androidBadge",
  "guide.pcTitle",
  "guide.pcBody",
  "guide.androidTitle",
  "guide.androidBody",
  "guide.conceptsTitle",
  "guide.deviceConcept",
  "guide.targetConcept",
  "guide.sessionConcept",
  "support.eyebrow",
  "support.title",
  "support.body",
  "support.openIssues"
] satisfies TranslationKey[];

let chinese: TranslationDictionary;

beforeAll(async () => {
  chinese = await loadTranslations("zh-CN");
});

describe("Chinese dashboard translations", () => {
  it("provides an explicit Chinese value for every user-interface key", () => {
    expect(Object.keys(zhCNOverrides).sort()).toEqual(Object.keys(defaultTranslations).sort());
  });

  it("labels frame rate as FPS with a Chinese explanation", () => {
    expect(chinese["metric.fps"]).toBe("FPS(帧率)");
  });

  it("labels the repair page with the requested concise navigation text", () => {
    expect(chinese["nav.tools"]).toBe("修复/提交BUG");
    expect(chinese["support.title"]).toBe("修复/提交BUG");
  });

  it("does not fall back to English for user-facing dashboard copy", () => {
    for (const key of chineseDashboardKeys) {
      expect(chinese[key], key).not.toBe(defaultTranslations[key]);
    }
  });
});

describe("global translations", () => {
  const englishKeys = Object.keys(defaultTranslations).sort();
  const templateTokens = (value: string) =>
    [...value.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((match) => match[0]).sort();

  it("uses English as the product default", () => {
    expect(locales[0]).toBe("en-US");
    expect(defaultTranslations).toEqual(englishJson);
  });

  it("registers a non-empty runtime locale list with English first and no duplicates", () => {
    expect(locales.length).toBeGreaterThan(0);
    expect(locales[0]).toBe("en-US");
    expect(new Set(locales).size).toBe(locales.length);
  });

  it("uses one authoritative Microsoft Store-aligned target catalog", () => {
    expect(localeCatalog).toHaveLength(101);
    expect(new Set(localeCatalog.map(({ locale }) => locale)).size).toBe(localeCatalog.length);
    expect(localeCatalog[0]?.locale).toBe("en-US");
    expect(localeCatalog.map(({ locale }) => locale)).toContain("ar-SA");
    expect(localeCatalog.map(({ locale }) => locale)).toContain("fr-CA");
    expect(localeCatalog.map(({ locale }) => locale)).toContain("pa-IN");
    expect(localeCatalog.map(({ locale }) => locale)).not.toEqual(
      expect.arrayContaining(["eo", "la", "yue"])
    );
  });

  it("loads a complete, non-empty dictionary and searchable labels for every runtime locale", async () => {
    for (const locale of locales) {
      const dictionary = await loadTranslations(locale);
      expect(localeLabels[locale].trim().length, locale).toBeGreaterThan(0);
      expect(localeEnglishNames[locale].trim().length, locale).toBeGreaterThan(0);
      expect(Object.keys(dictionary).sort(), locale).toEqual(englishKeys);
      for (const key of englishKeys as TranslationKey[]) {
        expect(dictionary[key].trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  }, 120_000);

  it("preserves every runtime template placeholder", async () => {
    for (const locale of locales) {
      const dictionary = await loadTranslations(locale);
      for (const key of englishKeys as TranslationKey[]) {
        expect(templateTokens(dictionary[key]), `${locale}:${key}`).toEqual(
          templateTokens(defaultTranslations[key])
        );
      }
    }
  }, 120_000);

  it("keeps the Serbian Latin and Cyrillic dictionaries in their declared scripts", async () => {
    const latin = await loadTranslations("sr");
    const cyrillic = await loadTranslations("sr-Cyrl-RS");
    const serbianCyrillic = /[А-Ша-шЂђЈјЉљЊњЋћЏџ]/u;

    expect(latin["nav.session"]).toBe("Pokreni test");
    expect(cyrillic["nav.session"]).toBe("Покрени тест");
    expect(Object.values(latin).some((value) => serbianCyrillic.test(value))).toBe(false);
    expect(Object.values(cyrillic).some((value) => serbianCyrillic.test(value))).toBe(true);
  });

  it("keeps critical Hindi report and packaging text complete and technically precise", async () => {
    const hindi = await loadTranslations("hi-IN");

    expect(hindi["report.noSessionMessage"]).toContain("sessionId");
    expect(hindi["report.presentMon"]).toBe("PresentMon कैप्चर");
    expect(hindi["packaging.check2"]).toContain("Bearer token");
    expect(hindi["packaging.check2"]).toContain("REST");
    expect(hindi["packaging.check2"]).toContain("WebSocket");
    expect(hindi["chart.nullsNotZero"]).toBe("अनुपलब्ध मानों को 0 के रूप में नहीं दिखाया जाता");
    expect(hindi["metric.batteryTemp"]).toBe("बैटरी का तापमान");
  });

  it("keeps critical Slovak report and packaging text complete and technically precise", async () => {
    const slovak = await loadTranslations("sk-SK");

    expect(slovak["report.noSessionMessage"]).toContain("sessionId");
    expect(slovak["report.presentMon"]).toBe("Snímanie PresentMon");
    expect(slovak["packaging.check2"]).toContain("Bearer token");
    expect(slovak["packaging.check2"]).toContain("REST");
    expect(slovak["packaging.check2"]).toContain("WebSocket");
    expect(slovak["chart.nullsNotZero"]).toBe("chýbajúce hodnoty sa nevykresľujú ako 0");
    expect(slovak["metric.batteryTemp"]).toBe("Teplota batérie");
  });

  it("keeps critical Slovenian report and packaging text complete and technically precise", async () => {
    const slovenian = await loadTranslations("sl-SI");

    expect(slovenian["report.noSessionMessage"]).toContain("sessionId");
    expect(slovenian["report.presentMon"]).toBe("Zajem PresentMon");
    expect(slovenian["packaging.check1"]).toContain("127.0.0.1");
    expect(slovenian["packaging.check2"]).toContain("Bearer token");
    expect(slovenian["packaging.check2"]).toContain("REST");
    expect(slovenian["packaging.check2"]).toContain("WebSocket");
    expect(slovenian["chart.nullsNotZero"]).toBe("manjkajoče vrednosti se ne izrišejo kot 0");
    expect(slovenian["metric.batteryTemp"]).toBe("Temperatura baterije");
  });

  it("keeps critical Macedonian report and packaging text complete and technically precise", async () => {
    const macedonian = await loadTranslations("mk-MK");

    expect(macedonian["report.noSessionMessage"]).toContain("sessionId");
    expect(macedonian["report.presentMon"]).toBe("Снимање со PresentMon");
    expect(macedonian["packaging.check1"]).toContain("127.0.0.1");
    expect(macedonian["packaging.check2"]).toContain("Bearer token");
    expect(macedonian["packaging.check2"]).toContain("REST");
    expect(macedonian["packaging.check2"]).toContain("WebSocket");
    expect(macedonian["chart.nullsNotZero"]).toBe(
      "вредностите што недостигаат не се исцртуваат како 0"
    );
    expect(macedonian["metric.batteryTemp"]).toBe("Температура на батеријата");
  });

  it("keeps critical Albanian report and Android setup text complete and technically precise", async () => {
    const albanian = await loadTranslations("sq-AL");

    expect(albanian["report.noSessionMessage"]).toContain("sessionId");
    expect(albanian["report.presentMon"]).toBe("Regjistrimi PresentMon");
    expect(albanian["packaging.check1"]).toContain("127.0.0.1");
    expect(albanian["packaging.check2"]).toContain("Bearer token");
    expect(albanian["packaging.check2"]).toContain("REST");
    expect(albanian["packaging.check2"]).toContain("WebSocket");
    expect(albanian["session.androidStep1"]).toContain("korrigjimin e gabimeve me USB");
    expect(albanian["chart.nullsNotZero"]).toBe("vlerat që mungojnë nuk vizatohen si 0");
    expect(albanian["metric.batteryTemp"]).toBe("Temperatura e baterisë");
  });

  it("keeps critical Armenian report and Android setup text complete and technically precise", async () => {
    const armenian = await loadTranslations("hy-AM");

    expect(armenian["report.noSessionMessage"]).toContain("sessionId");
    expect(armenian["report.presentMon"]).toBe("PresentMon գրանցում");
    expect(armenian["packaging.check1"]).toContain("127.0.0.1");
    expect(armenian["packaging.check2"]).toContain("Bearer");
    expect(armenian["packaging.check2"]).toContain("REST");
    expect(armenian["packaging.check2"]).toContain("WebSocket");
    expect(armenian["session.androidStep1"]).toContain("USB կարգաբերումը");
    expect(armenian["chart.nullsNotZero"]).toBe("բացակայող արժեքները չեն գծվում որպես 0");
    expect(armenian["metric.batteryTemp"]).toBe("Մարտկոցի ջերմաստիճան");
  });

  it("keeps critical Azerbaijani report and Android setup text complete and technically precise", async () => {
    const azerbaijani = await loadTranslations("az-Latn-AZ");

    expect(azerbaijani["report.noSessionMessage"]).toContain("sessionId");
    expect(azerbaijani["report.presentMon"]).toBe("PresentMon qeydi");
    expect(azerbaijani["packaging.check1"]).toContain("127.0.0.1");
    expect(azerbaijani["packaging.check2"]).toContain("Bearer token");
    expect(azerbaijani["packaging.check2"]).toContain("REST");
    expect(azerbaijani["packaging.check2"]).toContain("WebSocket");
    expect(azerbaijani["session.androidStep1"]).toContain("USB sazlamanı");
    expect(azerbaijani["chart.nullsNotZero"]).toBe("çatışmayan dəyərlər 0 kimi çəkilmir");
    expect(azerbaijani["metric.batteryTemp"]).toBe("Batareya temperaturu");
  });

  it("keeps critical Basque report and Android setup text complete and technically precise", async () => {
    const basque = await loadTranslations("eu-ES");

    expect(basque["report.noSessionMessage"]).toContain("sessionId");
    expect(basque["report.presentMon"]).toBe("PresentMon kaptura");
    expect(basque["packaging.check1"]).toContain("127.0.0.1");
    expect(basque["packaging.check2"]).toContain("Bearer token");
    expect(basque["packaging.check2"]).toContain("REST");
    expect(basque["packaging.check2"]).toContain("WebSocket");
    expect(basque["session.androidStep1"]).toContain("USB arazketa");
    expect(basque["chart.nullsNotZero"]).toBe("falta diren balioak ez dira 0 gisa marrazten");
    expect(basque["metric.batteryTemp"]).toBe("Bateriaren tenperatura");
  });

  it("keeps critical Belarusian report and Android setup text complete and technically precise", async () => {
    const belarusian = await loadTranslations("be-BY");

    expect(belarusian["report.noSessionMessage"]).toContain("sessionId");
    expect(belarusian["report.presentMon"]).toBe("Захоп PresentMon");
    expect(belarusian["packaging.check1"]).toContain("127.0.0.1");
    expect(belarusian["packaging.check2"]).toContain("Bearer token");
    expect(belarusian["packaging.check2"]).toContain("REST");
    expect(belarusian["packaging.check2"]).toContain("WebSocket");
    expect(belarusian["session.androidStep1"]).toContain("адладку па USB");
    expect(belarusian["chart.nullsNotZero"]).toBe("адсутныя значэнні не паказваюцца як 0");
    expect(belarusian["metric.batteryTemp"]).toBe("Тэмпература батарэі");
  });

  it("keeps critical Dari report and Android setup text complete and technically precise", async () => {
    const dari = await loadTranslations("prs-AF");

    expect(dari["report.noSessionMessage"]).toContain("sessionId");
    expect(dari["report.presentMon"]).toBe("ثبت PresentMon");
    expect(dari["packaging.check1"]).toContain("127.0.0.1");
    expect(dari["packaging.check2"]).toContain("Bearer token");
    expect(dari["packaging.check2"]).toContain("REST");
    expect(dari["packaging.check2"]).toContain("WebSocket");
    expect(dari["session.androidStep1"]).toContain("اشکال‌زدایی USB");
    expect(dari["chart.nullsNotZero"]).toBe("مقدارهای ناموجود به‌شکل 0 رسم نمی‌شوند");
    expect(dari["metric.batteryTemp"]).toBe("دمای باتری");
  });

  it("keeps critical Icelandic report and Android setup text complete and technically precise", async () => {
    const icelandic = await loadTranslations("is-IS");

    expect(icelandic["report.noSessionMessage"]).toContain("sessionId");
    expect(icelandic["report.presentMon"]).toBe("PresentMon-skráning");
    expect(icelandic["packaging.check1"]).toContain("127.0.0.1");
    expect(icelandic["packaging.check2"]).toContain("Bearer token");
    expect(icelandic["packaging.check2"]).toContain("REST");
    expect(icelandic["packaging.check2"]).toContain("WebSocket");
    expect(icelandic["session.androidStep1"]).toContain("USB-kembingu");
    expect(icelandic["chart.nullsNotZero"]).toBe("gildi sem vantar eru ekki teiknuð sem 0");
    expect(icelandic["metric.batteryTemp"]).toBe("Hitastig rafhlöðu");
  });

  it("keeps critical Zulu report and Android setup text complete and technically precise", async () => {
    const zulu = await loadTranslations("zu-ZA");

    expect(zulu["report.noSessionMessage"]).toContain("sessionId");
    expect(zulu["report.presentMon"]).toBe("Ukuqoshwa kwe-PresentMon");
    expect(zulu["packaging.check1"]).toContain("127.0.0.1");
    expect(zulu["packaging.check2"]).toContain("Bearer token");
    expect(zulu["packaging.check2"]).toContain("REST");
    expect(zulu["packaging.check2"]).toContain("WebSocket");
    expect(zulu["session.androidStep1"]).toContain("amaphutha nge-USB");
    expect(zulu["chart.nullsNotZero"]).toBe("amanani angekho awadwetshwa njengo-0");
    expect(zulu["metric.batteryTemp"]).toBe("Izinga lokushisa lebhethri");
  });

  it("keeps critical Xhosa report and Android setup text complete and technically precise", async () => {
    const xhosa = await loadTranslations("xh-ZA");

    expect(xhosa["report.noSessionMessage"]).toContain("sessionId");
    expect(xhosa["report.presentMon"]).toBe("Ukurekhodwa kwe-PresentMon");
    expect(xhosa["packaging.check1"]).toContain("127.0.0.1");
    expect(xhosa["packaging.check2"]).toContain("Bearer token");
    expect(xhosa["packaging.check2"]).toContain("REST");
    expect(xhosa["packaging.check2"]).toContain("WebSocket");
    expect(xhosa["session.androidStep1"]).toContain("iimpazamo nge-USB");
    expect(xhosa["chart.nullsNotZero"]).toBe("amaxabiso angekhoyo awazotywa njengo-0");
    expect(xhosa["metric.batteryTemp"]).toBe("Iqondo lobushushu bebhetri");
  });

  it("keeps critical Hausa report and Android setup text complete and technically precise", async () => {
    const hausa = await loadTranslations("ha-Latn-NG");

    expect(hausa["report.noSessionMessage"]).toContain("sessionId");
    expect(hausa["report.presentMon"]).toBe("Rikodin PresentMon");
    expect(hausa["packaging.check1"]).toContain("127.0.0.1");
    expect(hausa["packaging.check2"]).toContain("Bearer token");
    expect(hausa["packaging.check2"]).toContain("REST");
    expect(hausa["packaging.check2"]).toContain("WebSocket");
    expect(hausa["session.androidStep1"]).toContain("gyaran kuskure ta USB");
    expect(hausa["chart.nullsNotZero"]).toBe("ba a zana ƙimomin da suka ɓace a matsayin 0 ba");
    expect(hausa["metric.batteryTemp"]).toBe("Zafin Baturi");
  });

  it("keeps critical Luxembourgish report and Android setup text complete and technically precise", async () => {
    const luxembourgish = await loadTranslations("lb-LU");

    expect(luxembourgish["report.noSessionMessage"]).toContain("sessionId");
    expect(luxembourgish["report.presentMon"]).toBe("PresentMon-Opnam");
    expect(luxembourgish["packaging.check1"]).toContain("127.0.0.1");
    expect(luxembourgish["packaging.check2"]).toContain("Bearer token");
    expect(luxembourgish["packaging.check2"]).toContain("REST");
    expect(luxembourgish["packaging.check2"]).toContain("WebSocket");
    expect(luxembourgish["session.androidStep1"]).toContain("USB-Debugging");
    expect(luxembourgish["chart.nullsNotZero"]).toBe("feelend Wäerter ginn net als 0 gezeechent");
    expect(luxembourgish["metric.batteryTemp"]).toBe("Batterietemperatur");
  });

  it("keeps critical Konkani report and Android setup text complete and technically precise", async () => {
    const konkani = await loadTranslations("kok-IN");

    expect(konkani["report.noSessionMessage"]).toContain("sessionId");
    expect(konkani["report.presentMon"]).toBe("PresentMon कॅप्चर");
    expect(konkani["packaging.check1"]).toContain("127.0.0.1");
    expect(konkani["packaging.check2"]).toContain("Bearer token");
    expect(konkani["packaging.check2"]).toContain("REST");
    expect(konkani["packaging.check2"]).toContain("WebSocket");
    expect(konkani["session.androidStep1"]).toContain("USB डीबगिंग");
    expect(konkani["chart.nullsNotZero"]).toBe("उणीं मोलां 0 म्हणून रेखाटलीं वच नात");
    expect(konkani["metric.batteryTemp"]).toBe("बॅटरी तापमान");
  });

  it("keeps critical Uzbek report and Android setup text complete and technically precise", async () => {
    const uzbek = await loadTranslations("uz-Latn-UZ");

    expect(uzbek["report.noSessionMessage"]).toContain("sessionId");
    expect(uzbek["report.presentMon"]).toBe("PresentMon yozuvi");
    expect(uzbek["packaging.check1"]).toContain("127.0.0.1");
    expect(uzbek["packaging.check2"]).toContain("Bearer token");
    expect(uzbek["packaging.check2"]).toContain("REST");
    expect(uzbek["packaging.check2"]).toContain("WebSocket");
    expect(uzbek["session.androidStep1"]).toContain("USB orqali nosozliklarni tuzatishni");
    expect(uzbek["chart.nullsNotZero"]).toBe("yetishmayotgan qiymatlar 0 sifatida chizilmaydi");
    expect(uzbek["metric.batteryTemp"]).toBe("Batareya harorati");
  });

  it("keeps critical Kazakh report and Android setup text complete and technically precise", async () => {
    const kazakh = await loadTranslations("kk-KZ");

    expect(kazakh["report.noSessionMessage"]).toContain("sessionId");
    expect(kazakh["report.presentMon"]).toBe("PresentMon жазуы");
    expect(kazakh["packaging.check1"]).toContain("127.0.0.1");
    expect(kazakh["packaging.check2"]).toContain("Bearer token");
    expect(kazakh["packaging.check2"]).toContain("REST");
    expect(kazakh["packaging.check2"]).toContain("WebSocket");
    expect(kazakh["session.androidStep1"]).toContain("USB арқылы жөндеуді");
    expect(kazakh["chart.nullsNotZero"]).toBe("жетіспейтін мәндер 0 ретінде сызылмайды");
    expect(kazakh["metric.batteryTemp"]).toBe("Батарея температурасы");
  });

  it("keeps critical Kyrgyz report and Android setup text complete and technically precise", async () => {
    const kyrgyz = await loadTranslations("ky-KG");

    expect(kyrgyz["report.noSessionMessage"]).toContain("sessionId");
    expect(kyrgyz["report.presentMon"]).toBe("PresentMon жаздыруусу");
    expect(kyrgyz["packaging.check1"]).toContain("127.0.0.1");
    expect(kyrgyz["packaging.check2"]).toContain("Bearer token");
    expect(kyrgyz["packaging.check2"]).toContain("REST");
    expect(kyrgyz["packaging.check2"]).toContain("WebSocket");
    expect(kyrgyz["session.androidStep1"]).toContain("USB мүчүлүштүктөрүн оңдоону");
    expect(kyrgyz["chart.nullsNotZero"]).toBe("жетишпеген маанилер 0 катары сызылбайт");
    expect(kyrgyz["metric.batteryTemp"]).toBe("Батареянын температурасы");
  });

  it("keeps critical Tajik report and Android setup text complete and technically precise", async () => {
    const tajik = await loadTranslations("tg-Cyrl-TJ");

    expect(tajik["report.noSessionMessage"]).toContain("sessionId");
    expect(tajik["report.presentMon"]).toBe("Сабти PresentMon");
    expect(tajik["packaging.check1"]).toContain("127.0.0.1");
    expect(tajik["packaging.check2"]).toContain("Bearer token");
    expect(tajik["packaging.check2"]).toContain("REST");
    expect(tajik["packaging.check2"]).toContain("WebSocket");
    expect(tajik["session.androidStep1"]).toContain("ислоҳи хатои USB");
    expect(tajik["chart.nullsNotZero"]).toBe("қиматҳои намерасида ҳамчун 0 кашида намешаванд");
    expect(tajik["metric.batteryTemp"]).toBe("Ҳарорати батарея");
  });

  it("keeps critical Latvian report and Android setup text complete and technically precise", async () => {
    const latvian = await loadTranslations("lv-LV");

    expect(latvian["report.noSessionMessage"]).toContain("sessionId");
    expect(latvian["report.presentMon"]).toBe("PresentMon tveršana");
    expect(latvian["packaging.check1"]).toContain("127.0.0.1");
    expect(latvian["packaging.check2"]).toContain("Bearer token");
    expect(latvian["packaging.check2"]).toContain("REST");
    expect(latvian["packaging.check2"]).toContain("WebSocket");
    expect(latvian["session.androidStep1"]).toContain("USB atkļūdošanu");
    expect(latvian["chart.nullsNotZero"]).toBe("trūkstošās vērtības netiek attēlotas kā 0");
    expect(latvian["metric.batteryTemp"]).toBe("Akumulatora temperatūra");
  });

  it("keeps critical Lithuanian report and Android setup text complete and technically precise", async () => {
    const lithuanian = await loadTranslations("lt-LT");

    expect(lithuanian["report.noSessionMessage"]).toContain("sessionId");
    expect(lithuanian["report.presentMon"]).toBe("PresentMon fiksavimas");
    expect(lithuanian["packaging.check1"]).toContain("127.0.0.1");
    expect(lithuanian["packaging.check2"]).toContain("Bearer token");
    expect(lithuanian["packaging.check2"]).toContain("REST");
    expect(lithuanian["packaging.check2"]).toContain("WebSocket");
    expect(lithuanian["session.androidStep1"]).toContain("USB derinimą");
    expect(lithuanian["chart.nullsNotZero"]).toBe("trūkstamos reikšmės nebraižomos kaip 0");
    expect(lithuanian["metric.batteryTemp"]).toBe("Akumuliatoriaus temperatūra");
  });

  it("keeps critical Maltese report and Android setup text complete and technically precise", async () => {
    const maltese = await loadTranslations("mt-MT");

    expect(maltese["report.noSessionMessage"]).toContain("sessionId");
    expect(maltese["report.presentMon"]).toBe("Qbid PresentMon");
    expect(maltese["packaging.check1"]).toContain("127.0.0.1");
    expect(maltese["packaging.check2"]).toContain("Bearer token");
    expect(maltese["packaging.check2"]).toContain("REST");
    expect(maltese["packaging.check2"]).toContain("WebSocket");
    expect(maltese["session.androidStep1"]).toContain("debugging USB");
    expect(maltese["chart.nullsNotZero"]).toBe("il-valuri nieqsa ma jiġux impinġija bħala 0");
    expect(maltese["metric.batteryTemp"]).toBe("Temperatura tal-batterija");
  });

  it("keeps critical Welsh report and Android setup text complete and technically precise", async () => {
    const welsh = await loadTranslations("cy-GB");

    expect(welsh["report.noSessionMessage"]).toContain("sessionId");
    expect(welsh["report.presentMon"]).toBe("Cipiad PresentMon");
    expect(welsh["packaging.check1"]).toContain("127.0.0.1");
    expect(welsh["packaging.check2"]).toContain("Bearer token");
    expect(welsh["packaging.check2"]).toContain("REST");
    expect(welsh["packaging.check2"]).toContain("WebSocket");
    expect(welsh["session.androidStep1"]).toContain("debugging USB");
    expect(welsh["chart.nullsNotZero"]).toBe("ni chaiff gwerthoedd coll eu plotio fel 0");
    expect(welsh["metric.batteryTemp"]).toBe("Tymheredd y batri");
  });

  it("keeps critical Irish report and Android setup text complete and technically precise", async () => {
    const irish = await loadTranslations("ga-IE");

    expect(irish["report.noSessionMessage"]).toContain("sessionId");
    expect(irish["report.presentMon"]).toBe("Gabháil PresentMon");
    expect(irish["packaging.check1"]).toContain("127.0.0.1");
    expect(irish["packaging.check2"]).toContain("Bearer token");
    expect(irish["packaging.check2"]).toContain("REST");
    expect(irish["packaging.check2"]).toContain("WebSocket");
    expect(irish["session.androidStep1"]).toContain("debugging USB");
    expect(irish["chart.nullsNotZero"]).toBe("ní bhreacfar luachanna ar iarraidh mar 0");
    expect(irish["metric.batteryTemp"]).toBe("Teocht an cheallra");
  });

  it("keeps critical Nepali report and Android setup text complete and technically precise", async () => {
    const nepali = await loadTranslations("ne-NP");

    expect(nepali["report.noSessionMessage"]).toContain("sessionId");
    expect(nepali["report.presentMon"]).toBe("PresentMon क्याप्चर");
    expect(nepali["packaging.check1"]).toContain("127.0.0.1");
    expect(nepali["packaging.check2"]).toContain("Bearer token");
    expect(nepali["packaging.check2"]).toContain("REST");
    expect(nepali["packaging.check2"]).toContain("WebSocket");
    expect(nepali["session.androidStep1"]).toContain("USB debugging");
    expect(nepali["chart.nullsNotZero"]).toBe("हराएका मानलाई 0 को रूपमा प्लट गरिँदैन");
    expect(nepali["metric.batteryTemp"]).toBe("ब्याट्री तापक्रम");
  });

  it("keeps critical Gujarati report and Android setup text complete and technically precise", async () => {
    const gujarati = await loadTranslations("gu-IN");

    expect(gujarati["report.noSessionMessage"]).toContain("sessionId");
    expect(gujarati["report.presentMon"]).toBe("PresentMon કૅપ્ચર");
    expect(gujarati["packaging.check1"]).toContain("127.0.0.1");
    expect(gujarati["packaging.check2"]).toContain("Bearer token");
    expect(gujarati["packaging.check2"]).toContain("REST");
    expect(gujarati["packaging.check2"]).toContain("WebSocket");
    expect(gujarati["session.androidStep1"]).toContain("USB debugging");
    expect(gujarati["chart.nullsNotZero"]).toBe("ગુમ મૂલ્યોને 0 તરીકે દોરાતા નથી");
    expect(gujarati["metric.batteryTemp"]).toBe("બેટરીનું તાપમાન");
  });

  it("keeps critical Georgian report and Android setup text complete and technically precise", async () => {
    const georgian = await loadTranslations("ka-GE");

    expect(georgian["report.noSessionMessage"]).toContain("sessionId");
    expect(georgian["report.presentMon"]).toBe("PresentMon გადაღება");
    expect(georgian["packaging.check1"]).toContain("127.0.0.1");
    expect(georgian["packaging.check2"]).toContain("Bearer token");
    expect(georgian["packaging.check2"]).toContain("REST");
    expect(georgian["packaging.check2"]).toContain("WebSocket");
    expect(georgian["session.androidStep1"]).toContain("USB debugging");
    expect(georgian["chart.nullsNotZero"]).toBe("გამოტოვებული მნიშვნელობები 0-ად არ იხატება");
    expect(georgian["metric.batteryTemp"]).toBe("ბატარეის ტემპერატურა");
  });

  it("keeps critical Scottish Gaelic report and Android setup text complete and technically precise", async () => {
    const gaelic = await loadTranslations("gd-GB");

    expect(gaelic["report.noSessionMessage"]).toContain("sessionId");
    expect(gaelic["report.presentMon"]).toBe("Glacadh PresentMon");
    expect(gaelic["packaging.check1"]).toContain("127.0.0.1");
    expect(gaelic["packaging.check2"]).toContain("Bearer token");
    expect(gaelic["packaging.check2"]).toContain("REST");
    expect(gaelic["packaging.check2"]).toContain("WebSocket");
    expect(gaelic["session.androidStep1"]).toContain("USB debugging");
    expect(gaelic["chart.nullsNotZero"]).toBe("cha tèid luachan a tha a dhìth a dhealbhadh mar 0");
    expect(gaelic["metric.batteryTemp"]).toBe("Teòthachd a' bhataraidh");
  });

  it("keeps critical Maori report and Android setup text complete and technically precise", async () => {
    const maori = await loadTranslations("mi-NZ");

    expect(maori["report.noSessionMessage"]).toContain("sessionId");
    expect(maori["report.presentMon"]).toBe("Hopu PresentMon");
    expect(maori["packaging.check1"]).toContain("127.0.0.1");
    expect(maori["packaging.check2"]).toContain("Bearer token");
    expect(maori["packaging.check2"]).toContain("REST");
    expect(maori["packaging.check2"]).toContain("WebSocket");
    expect(maori["session.androidStep1"]).toContain("USB debugging");
    expect(maori["chart.nullsNotZero"]).toBe("e kore ngā uara ngaro e tuhia hei 0");
    expect(maori["metric.batteryTemp"]).toBe("Pāmahana pūhiko");
  });

  it("keeps critical Mongolian report and Android setup text complete and technically precise", async () => {
    const mongolian = await loadTranslations("mn-MN");

    expect(mongolian["report.noSessionMessage"]).toContain("sessionId");
    expect(mongolian["report.presentMon"]).toBe("PresentMon бичлэг");
    expect(mongolian["packaging.check1"]).toContain("127.0.0.1");
    expect(mongolian["packaging.check2"]).toContain("Bearer token");
    expect(mongolian["packaging.check2"]).toContain("REST");
    expect(mongolian["packaging.check2"]).toContain("WebSocket");
    expect(mongolian["session.androidStep1"]).toContain("USB debugging");
    expect(mongolian["chart.nullsNotZero"]).toBe("алга болсон утгыг 0 гэж зурахгүй");
    expect(mongolian["metric.batteryTemp"]).toBe("Батарейн температур");
  });

  it("keeps critical Yoruba report and Android setup text complete and technically precise", async () => {
    const yoruba = await loadTranslations("yo-NG");

    expect(yoruba["report.noSessionMessage"]).toContain("sessionId");
    expect(yoruba["report.presentMon"]).toBe("Ìgbàkálẹ̀ PresentMon");
    expect(yoruba["packaging.check1"]).toContain("127.0.0.1");
    expect(yoruba["packaging.check2"]).toContain("Bearer token");
    expect(yoruba["packaging.check2"]).toContain("REST");
    expect(yoruba["packaging.check2"]).toContain("WebSocket");
    expect(yoruba["session.androidStep1"]).toContain("USB debugging");
    expect(yoruba["chart.nullsNotZero"]).toBe("a kì í ya àwọn iye tó sọnù gẹ́gẹ́ bí 0");
    expect(yoruba["metric.batteryTemp"]).toBe("Ìgbóná bátírì");
  });

  it("keeps critical Igbo report and Android setup text complete and technically precise", async () => {
    const igbo = await loadTranslations("ig-NG");

    expect(igbo["report.noSessionMessage"]).toContain("sessionId");
    expect(igbo["report.presentMon"]).toBe("Njide PresentMon");
    expect(igbo["packaging.check1"]).toContain("127.0.0.1");
    expect(igbo["packaging.check2"]).toContain("Bearer token");
    expect(igbo["packaging.check2"]).toContain("REST");
    expect(igbo["packaging.check2"]).toContain("WebSocket");
    expect(igbo["session.androidStep1"]).toContain("USB debugging");
    expect(igbo["chart.nullsNotZero"]).toBe("a naghị ese uru na-efu dịka 0");
    expect(igbo["metric.batteryTemp"]).toBe("Okpomọkụ Batrị");
  });

  it("keeps critical Kinyarwanda report and Android setup text complete and technically precise", async () => {
    const kinyarwanda = await loadTranslations("rw-RW");

    expect(kinyarwanda["report.noSessionMessage"]).toContain("sessionId");
    expect(kinyarwanda["report.presentMon"]).toBe("Ifatwa rya PresentMon");
    expect(kinyarwanda["packaging.check1"]).toContain("127.0.0.1");
    expect(kinyarwanda["packaging.check2"]).toContain("Bearer token");
    expect(kinyarwanda["packaging.check2"]).toContain("REST");
    expect(kinyarwanda["packaging.check2"]).toContain("WebSocket");
    expect(kinyarwanda["session.androidStep1"]).toContain("USB debugging");
    expect(kinyarwanda["chart.nullsNotZero"]).toBe("agaciro kabura ntigashushanywa nka 0");
    expect(kinyarwanda["metric.batteryTemp"]).toBe("Ubushyuhe bwa Batiri");
  });

  it("keeps critical Setswana report and Android setup text complete and technically precise", async () => {
    const setswana = await loadTranslations("tn-ZA");

    expect(setswana["report.noSessionMessage"]).toContain("sessionId");
    expect(setswana["report.presentMon"]).toBe("Kgatiso ya PresentMon");
    expect(setswana["packaging.check1"]).toContain("127.0.0.1");
    expect(setswana["packaging.check2"]).toContain("Bearer token");
    expect(setswana["packaging.check2"]).toContain("REST");
    expect(setswana["packaging.check2"]).toContain("WebSocket");
    expect(setswana["session.androidStep1"]).toContain("USB debugging");
    expect(setswana["chart.nullsNotZero"]).toBe("boleng jo bo seyong ga bo thalwe jaaka 0");
    expect(setswana["metric.batteryTemp"]).toBe("Mogote wa Beteri");
  });

  it("keeps critical Northern Sotho report and Android setup text complete and technically precise", async () => {
    const northernSotho = await loadTranslations("nso-ZA");

    expect(northernSotho["report.noSessionMessage"]).toContain("sessionId");
    expect(northernSotho["report.presentMon"]).toBe("Kgatišo ya PresentMon");
    expect(northernSotho["packaging.check1"]).toContain("127.0.0.1");
    expect(northernSotho["packaging.check2"]).toContain("Bearer token");
    expect(northernSotho["packaging.check2"]).toContain("REST");
    expect(northernSotho["packaging.check2"]).toContain("WebSocket");
    expect(northernSotho["session.androidStep1"]).toContain("USB debugging");
    expect(northernSotho["chart.nullsNotZero"]).toBe(
      "boleng bjo bo sego gona ga bo thalwe bjalo ka 0",
    );
    expect(northernSotho["metric.batteryTemp"]).toBe("Themperetšha ya Betri");
  });

  it("keeps critical Wolof report and Android setup text complete and technically precise", async () => {
    const wolof = await loadTranslations("wo-SN");

    expect(wolof["report.noSessionMessage"]).toContain("sessionId");
    expect(wolof["report.presentMon"]).toBe("Jàpp u PresentMon");
    expect(wolof["packaging.check1"]).toContain("127.0.0.1");
    expect(wolof["packaging.check2"]).toContain("Bearer token");
    expect(wolof["packaging.check2"]).toContain("REST");
    expect(wolof["packaging.check2"]).toContain("WebSocket");
    expect(wolof["session.androidStep1"]).toContain("USB debugging");
    expect(wolof["chart.nullsNotZero"]).toBe(
      "solo yi ñàkk duñu leen nataal ni 0",
    );
    expect(wolof["metric.batteryTemp"]).toBe("Tàngooru Batarey");
  });

  it("keeps critical Quechua report and Android setup text complete and technically precise", async () => {
    const quechua = await loadTranslations("quz-PE");

    expect(quechua["report.noSessionMessage"]).toContain("sessionId");
    expect(quechua["report.presentMon"]).toBe("PresentMon Huñuy");
    expect(quechua["packaging.check1"]).toContain("127.0.0.1");
    expect(quechua["packaging.check2"]).toContain("Bearer token");
    expect(quechua["packaging.check2"]).toContain("REST");
    expect(quechua["packaging.check2"]).toContain("WebSocket");
    expect(quechua["session.androidStep1"]).toContain("USB debugging");
    expect(quechua["chart.nullsNotZero"]).toBe(
      "chinkasqa chaninkunaqa 0 hina mana siq'isqachu",
    );
    expect(quechua["metric.batteryTemp"]).toBe("Batería Tàngoor");
  });

  it("keeps critical Kannada report and Android setup text complete and technically precise", async () => {
    const kannada = await loadTranslations("kn-IN");

    expect(kannada["report.noSessionMessage"]).toContain("sessionId");
    expect(kannada["report.presentMon"]).toBe("PresentMon ಸೆರೆಹಿಡಿತ");
    expect(kannada["packaging.check1"]).toContain("127.0.0.1");
    expect(kannada["packaging.check2"]).toContain("Bearer token");
    expect(kannada["packaging.check2"]).toContain("REST");
    expect(kannada["packaging.check2"]).toContain("WebSocket");
    expect(kannada["session.androidStep1"]).toContain("USB debugging");
    expect(kannada["chart.nullsNotZero"]).toBe(
      "ಕಾಣೆಯಾದ ಮೌಲ್ಯಗಳನ್ನು 0 ಎಂದು ಬಿಡಿಸಲಾಗುವುದಿಲ್ಲ",
    );
    expect(kannada["metric.batteryTemp"]).toBe("ಬ್ಯಾಟರಿ ತಾಪಮಾನ");
  });

  it("keeps critical Malayalam report and Android setup text complete and technically precise", async () => {
    const malayalam = await loadTranslations("ml-IN");

    expect(malayalam["report.noSessionMessage"]).toContain("sessionId");
    expect(malayalam["report.presentMon"]).toBe("PresentMon capture");
    expect(malayalam["packaging.check1"]).toContain("127.0.0.1");
    expect(malayalam["packaging.check2"]).toContain("Bearer token");
    expect(malayalam["packaging.check2"]).toContain("REST");
    expect(malayalam["packaging.check2"]).toContain("WebSocket");
    expect(malayalam["session.androidStep1"]).toContain("USB debugging");
    expect(malayalam["chart.nullsNotZero"]).toBe(
      "കാണാത്ത മൂല്യങ്ങൾ 0 ആയി വരയ്ക്കില്ല",
    );
    expect(malayalam["metric.batteryTemp"]).toBe("ബാറ്ററി താപനില");
  });

  it("keeps critical Odia report and Android setup text complete and technically precise", async () => {
    const odia = await loadTranslations("or-IN");

    expect(odia["report.noSessionMessage"]).toContain("sessionId");
    expect(odia["report.presentMon"]).toBe("PresentMon capture");
    expect(odia["packaging.check1"]).toContain("127.0.0.1");
    expect(odia["packaging.check2"]).toContain("Bearer token");
    expect(odia["packaging.check2"]).toContain("REST");
    expect(odia["packaging.check2"]).toContain("WebSocket");
    expect(odia["session.androidStep1"]).toContain("USB debugging");
    expect(odia["chart.nullsNotZero"]).toBe(
      "ଅନୁପସ୍ଥିତ ମୂଲ୍ୟ 0 ଭାବେ ଅଙ୍କାଯାଏନାହିଁ",
    );
    expect(odia["metric.batteryTemp"]).toBe("ବ୍ୟାଟେରୀ ତାପମାତ୍ରା");
  });

  it("keeps critical Sorani Kurdish report and Android setup text complete and technically precise", async () => {
    const sorani = await loadTranslations("ku-Arab-IQ");

    expect(sorani["report.noSessionMessage"]).toContain("sessionId");
    expect(sorani["report.presentMon"]).toBe("گرتنی PresentMon");
    expect(sorani["packaging.check1"]).toContain("127.0.0.1");
    expect(sorani["packaging.check2"]).toContain("Bearer token");
    expect(sorani["packaging.check2"]).toContain("REST");
    expect(sorani["packaging.check2"]).toContain("WebSocket");
    expect(sorani["session.androidStep1"]).toContain("USB debugging");
    expect(sorani["chart.nullsNotZero"]).toBe(
      "نرخە ونبووەکان بە 0 کێشران ناکرێن",
    );
    expect(sorani["metric.batteryTemp"]).toBe("پلەی گەرمی پاتری");
  });

  it("keeps critical Lao report and Android setup text complete and technically precise", async () => {
    const lao = await loadTranslations("lo-LA");

    expect(lao["report.noSessionMessage"]).toContain("sessionId");
    expect(lao["report.presentMon"]).toBe("PresentMon Capture");
    expect(lao["packaging.check1"]).toContain("127.0.0.1");
    expect(lao["packaging.check2"]).toContain("Bearer token");
    expect(lao["packaging.check2"]).toContain("REST");
    expect(lao["packaging.check2"]).toContain("WebSocket");
    expect(lao["session.androidStep1"]).toContain("USB debugging");
    expect(lao["chart.nullsNotZero"]).toBe(
      "ຄ່າທີ່ຂາດຈະບໍ່ຖືກແຕ້ມເປັນ 0",
    );
    expect(lao["metric.batteryTemp"]).toBe("ອຸນຫະພູມແບັດເຕີຣີ");
  });

  it("keeps critical Khmer report and Android setup text complete and technically precise", async () => {
    const khmer = await loadTranslations("km-KH");

    expect(khmer["report.noSessionMessage"]).toContain("sessionId");
    expect(khmer["report.presentMon"]).toBe("PresentMon Capture");
    expect(khmer["packaging.check1"]).toContain("127.0.0.1");
    expect(khmer["packaging.check2"]).toContain("Bearer token");
    expect(khmer["packaging.check2"]).toContain("REST");
    expect(khmer["packaging.check2"]).toContain("WebSocket");
    expect(khmer["session.androidStep1"]).toContain("USB debugging");
    expect(khmer["chart.nullsNotZero"]).toBe(
      "តម្លៃដែលខ្វះមិនត្រូវបានគូរជា 0 ទេ",
    );
    expect(khmer["metric.batteryTemp"]).toBe("សីតុណ្ហភាពថ្ម");
  });

  it("keeps critical Sinhala report and Android setup text complete and technically precise", async () => {
    const sinhala = await loadTranslations("si-LK");

    expect(sinhala["report.noSessionMessage"]).toContain("sessionId");
    expect(sinhala["report.presentMon"]).toBe("PresentMon Capture");
    expect(sinhala["packaging.check1"]).toContain("127.0.0.1");
    expect(sinhala["packaging.check2"]).toContain("Bearer token");
    expect(sinhala["packaging.check2"]).toContain("REST");
    expect(sinhala["packaging.check2"]).toContain("WebSocket");
    expect(sinhala["session.androidStep1"]).toContain("USB debugging");
    expect(sinhala["chart.nullsNotZero"]).toBe(
      "නොමැති අගයන් 0 ලෙස ඇඳෙන්නේ නැත",
    );
    expect(sinhala["metric.batteryTemp"]).toBe("බැටරි උෂ්ණත්වය");
  });

  it("keeps critical Sindhi report and Android setup text complete and technically precise", async () => {
    const sindhi = await loadTranslations("sd-Arab-PK");

    expect(sindhi["report.noSessionMessage"]).toContain("sessionId");
    expect(sindhi["report.presentMon"]).toBe("PresentMon Capture");
    expect(sindhi["packaging.check1"]).toContain("127.0.0.1");
    expect(sindhi["packaging.check2"]).toContain("Bearer token");
    expect(sindhi["packaging.check2"]).toContain("REST");
    expect(sindhi["packaging.check2"]).toContain("WebSocket");
    expect(sindhi["session.androidStep1"]).toContain("USB debugging");
    expect(sindhi["chart.nullsNotZero"]).toBe(
      "گم ٿيل قدر 0 طور نه چٽيا ويندا آهن",
    );
    expect(sindhi["metric.batteryTemp"]).toBe("بيٽري جو گرمي پد");
  });

  it("keeps critical Tigrinya report and Android setup text complete and technically precise", async () => {
    const tigrinya = await loadTranslations("ti-ET");

    expect(tigrinya["report.noSessionMessage"]).toContain("sessionId");
    expect(tigrinya["report.presentMon"]).toBe("PresentMon Capture");
    expect(tigrinya["packaging.check1"]).toContain("127.0.0.1");
    expect(tigrinya["packaging.check2"]).toContain("Bearer token");
    expect(tigrinya["packaging.check2"]).toContain("REST");
    expect(tigrinya["packaging.check2"]).toContain("WebSocket");
    expect(tigrinya["session.androidStep1"]).toContain("USB debugging");
    expect(tigrinya["chart.nullsNotZero"]).toBe(
      "ዝጎደሉ ዋጋታት ከም 0 ኣይስኣሉን",
    );
    expect(tigrinya["metric.batteryTemp"]).toBe("ሙቐት Battery");
  });

  it("keeps critical Inuktitut report and Android setup text complete and technically precise", async () => {
    const inuktitut = await loadTranslations("iu-Latn-CA");

    expect(inuktitut["report.noSessionMessage"]).toContain("sessionId");
    expect(inuktitut["report.presentMon"]).toBe("PresentMon Capture");
    expect(inuktitut["packaging.check1"]).toContain("127.0.0.1");
    expect(inuktitut["packaging.check2"]).toContain("Bearer token");
    expect(inuktitut["packaging.check2"]).toContain("REST");
    expect(inuktitut["packaging.check2"]).toContain("WebSocket");
    expect(inuktitut["session.androidStep1"]).toContain("USB debugging");
    expect(inuktitut["chart.nullsNotZero"]).toBe(
      "Piunngittut akit 0-tut titirarneqanngillat",
    );
    expect(inuktitut["metric.batteryTemp"]).toBe("Battery uunnarninga");
  });

  it("keeps critical K'iche' report and Android setup text complete and technically precise", async () => {
    const kiche = await loadTranslations("quc-Latn");

    expect(kiche["report.noSessionMessage"]).toContain("sessionId");
    expect(kiche["report.presentMon"]).toBe("PresentMon Capture");
    expect(kiche["packaging.check1"]).toContain("127.0.0.1");
    expect(kiche["packaging.check2"]).toContain("Bearer token");
    expect(kiche["packaging.check2"]).toContain("REST");
    expect(kiche["packaging.check2"]).toContain("WebSocket");
    expect(kiche["session.androidStep1"]).toContain("USB debugging");
    expect(kiche["chart.nullsNotZero"]).toBe(
      "Ri rajil man k'o ta man nitz'ib'ax ta jas 0",
    );
    expect(kiche["metric.batteryTemp"]).toBe("Battery k'atän");
  });

  it("keeps critical Cherokee report and Android setup text complete and technically precise", async () => {
    const cherokee = await loadTranslations("chr-Cher-US");

    expect(cherokee["report.noSessionMessage"]).toContain("sessionId");
    expect(cherokee["report.presentMon"]).toBe("PresentMon ᎦᏂᏱᏍᎩ");
    expect(cherokee["packaging.check1"]).toContain("127.0.0.1");
    expect(cherokee["packaging.check2"]).toContain("Bearer token");
    expect(cherokee["packaging.check2"]).toContain("REST");
    expect(cherokee["packaging.check2"]).toContain("WebSocket");
    expect(cherokee["session.androidStep1"]).toContain("USB debugging");
    expect(cherokee["chart.nullsNotZero"]).toBe(
      "Ꮭ ᎠᏯᎢ ᎠᎬᏩᏛᏗ 0 ᎾᏍᎩ ᏱᏗᎬᏂᎨᏍᏗ",
    );
    expect(cherokee["metric.batteryTemp"]).toBe(
      "ᎠᎾᎦᎵᏍᎩ ᎤᏴᏜᏫᏍᏗ",
    );
  });
});
