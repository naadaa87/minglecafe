/* ============================================================
   밍글 검색 노출 공통 모듈 — 빌드(tools/build.mjs)와 서버(functions/)가 함께 씁니다.
   - 매장 기본 정보와 구조화 데이터(검색엔진·AI가 읽는 형식)
   - 관리자가 입력하는 '매장 편의 정보'(와이파이·화장실·주차 등)
   - IndexNow: 새 글이나 바뀐 주소를 네이버·빙에 바로 알리기
   ============================================================ */
import { esc } from "./md.js";

export const ORIGIN = "https://hellomingle.kr";
export const KAKAO_CHANNEL = "http://pf.kakao.com/_AxgYMn/friend";

/** 매장 기본 정보 — 여기 한 곳만 고치면 구조화 데이터 전체가 바뀝니다 */
export const STORE = {
  name: "밍글 무인카페 건대화양점",
  short: "밍글 건대화양점",
  alt: ["MINGLE", "밍글", "밍글 건대화양점", "밍글 무인디저트카페", "Mingle Konkuk-Hwayang"],
  street: "능동로13길 39",
  streetEn: "39 Neungdong-ro 13-gil",
  locality: "광진구",
  region: "서울특별시",
  lot: "서울특별시 광진구 화양동 10-1",
  lat: 37.543497,
  lng: 127.07002,
  naverMap: "https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%20%EA%B4%91%EC%A7%84%EA%B5%AC%20%EB%8A%A5%EB%8F%99%EB%A1%9C13%EA%B8%B8%2039",
  kakaoMap: "https://map.kakao.com/?q=%EC%84%9C%EC%9A%B8%20%EA%B4%91%EC%A7%84%EA%B5%AC%20%EB%8A%A5%EB%8F%99%EB%A1%9C13%EA%B8%B8%2039",
  googleMap: "https://www.google.com/maps/search/?api=1&query=37.543497%2C127.07002&query_place_id=ChIJY2JDcgClfDURqyJd3EX4bJo",
};

export const ORG_ID = ORIGIN + "/#org";
export const STORE_ID = ORIGIN + "/#store";
export const SITE_ID = ORIGIN + "/#website";

export function orgLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "밍글",
    alternateName: ["MINGLE", "밍글 무인디저트카페"],
    url: ORIGIN + "/",
    logo: { "@type": "ImageObject", url: ORIGIN + "/img/logo.png" },
    description: "서울 건대입구·화양동에서 24시간 무인 디저트카페와 동네 커뮤니티를 운영하는 브랜드",
    founder: { "@type": "Person", name: "최시준", jobTitle: "대표" },
    contactPoint: { "@type": "ContactPoint", contactType: "customer service", url: KAKAO_CHANNEL, availableLanguage: ["ko"] },
    sameAs: ["http://pf.kakao.com/_AxgYMn"],
  };
}

export function siteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: "밍글",
    alternateName: ["MINGLE", "밍글 무인디저트카페", "hellomingle"],
    url: ORIGIN + "/",
    inLanguage: "ko-KR",
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: ORIGIN + "/search?q={search_term_string}" },
      "query-input": "required name=search_term_string",
    },
  };
}

/** 매장(카페) 구조화 데이터 */
export function storeLd({ lang = "ko" } = {}) {
  const en = lang === "en";
  return {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    "@id": STORE_ID,
    name: en ? "Mingle Konkuk-Hwayang" : STORE.name,
    alternateName: STORE.alt,
    url: ORIGIN + (en ? "/en/visit" : "/store"),
    logo: ORIGIN + "/img/logo.png",
    image: [
      ORIGIN + "/img/og/store-exterior.jpg",
      ORIGIN + "/img/store-exterior.webp",
      ORIGIN + "/img/store-seat.webp",
      ORIGIN + "/img/store-shelf.webp",
      ORIGIN + "/img/store-kiosk.webp",
    ],
    description: en
      ? "A 24-hour self-service dessert café near Konkuk University Station in Hwayang-dong, Seoul. About 100 m² of seating with window seats and power outlets, machine-brewed coffee, chilled and baked desserts, and a neighbourhood community board."
      : "건대입구역 근처 화양동에 있는 24시간 무인 디저트카페. 약 30평 좌석과 창가 콘센트 자리, 머신에서 바로 내리는 커피, 냉장·상온 디저트를 갖추고 동네 커뮤니티를 함께 운영합니다.",
    address: {
      "@type": "PostalAddress",
      streetAddress: en ? STORE.streetEn : STORE.street,
      addressLocality: en ? "Gwangjin-gu" : STORE.locality,
      addressRegion: en ? "Seoul" : STORE.region,
      addressCountry: "KR",
    },
    geo: { "@type": "GeoCoordinates", latitude: STORE.lat, longitude: STORE.lng },
    hasMap: [STORE.naverMap, STORE.kakaoMap, STORE.googleMap],
    areaServed: [
      { "@type": "Place", name: "건대입구" },
      { "@type": "Place", name: "화양동" },
      { "@type": "AdministrativeArea", name: "서울특별시 광진구" },
    ],
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59",
    }],
    openingHours: "Mo-Su 00:00-23:59",
    servesCuisine: ["Coffee", "Dessert", "Cake", "Bakery"],
    paymentAccepted: "Credit Card, Mobile Payment",
    currenciesAccepted: "KRW",
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "24시간 무인 운영", value: true },
      { "@type": "LocationFeatureSpecification", name: "창가 콘센트 좌석", value: true },
      { "@type": "LocationFeatureSpecification", name: "키오스크 셀프 주문", value: true },
      { "@type": "LocationFeatureSpecification", name: "이용 시간 제한 없음", value: true },
      { "@type": "LocationFeatureSpecification", name: "포장 가능", value: true },
    ],
    publicAccess: true,
    hasMenu: ORIGIN + "/menu",
    parentOrganization: { "@id": ORG_ID },
    sameAs: ["http://pf.kakao.com/_AxgYMn", STORE.googleMap],
  };
}

/** 메뉴 구조화 데이터 (기본 메뉴는 빌드가, 관리자가 고친 메뉴는 서버가 넣습니다) */
export function menuLd(menu) {
  if (!menu || !Array.isArray(menu.groups)) return null;
  const sections = menu.groups
    .map((g) => {
      const items = (g.items || []).filter((it) => !it.hidden);
      if (!items.length) return null;
      return {
        "@type": "MenuSection",
        name: g.ko,
        ...(g.desc ? { description: g.desc } : {}),
        hasMenuItem: items.map((it) => ({
          "@type": "MenuItem",
          name: it.ko,
          ...(it.en ? { alternateName: it.en } : {}),
          ...(it.desc ? { description: it.desc } : {}),
          ...(it.price ? { offers: { "@type": "Offer", price: Number(it.price), priceCurrency: "KRW" } } : {}),
        })),
      };
    })
    .filter(Boolean);
  if (!sections.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": ORIGIN + "/menu#menu",
    name: "밍글 건대화양점 메뉴",
    url: ORIGIN + "/menu",
    inLanguage: "ko-KR",
    hasMenuSection: sections,
  };
}

export const ldScript = (o, attrs = "") =>
  `<script type="application/ld+json"${attrs}>${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

/* ============================================================
   매장 편의 정보 — 관리자 > 사이트 정보에서 입력
   확인된 사실만 손님 화면·자주 묻는 질문·구조화 데이터에 나갑니다. 비워 둔 항목은 어디에도 나오지 않습니다.
   ============================================================ */
export const FACT_FIELDS = [
  { key: "walk", label: "오시는 길", q: "건대입구역에서 밍글까지 얼마나 걸리나요?", yn: false, hint: "예: 2호선 건대입구역 2번 출구에서 걸어서 5분쯤 걸려요." },
  { key: "wifi", label: "와이파이", q: "밍글에서 와이파이를 쓸 수 있나요?", yn: true, amenity: "무료 와이파이", hint: "예: 네, 무료 와이파이가 있어요. 비밀번호는 매장 안내판에 적혀 있습니다." },
  { key: "restroom", label: "화장실", q: "밍글에 화장실이 있나요?", yn: true, amenity: "화장실", hint: "예: 건물 1층 공용 화장실을 쓰실 수 있어요." },
  { key: "parking", label: "주차", q: "밍글에 주차할 수 있나요?", yn: true, amenity: "주차", hint: "예: 전용 주차장은 없어요. 가까운 공영주차장을 이용해 주세요." },
  { key: "security", label: "CCTV · 보안", q: "밍글 매장에 CCTV나 보안 장치가 있나요?", yn: true, amenity: "CCTV", hint: "예: 네, 매장 안팎에 CCTV가 있고 보안 서비스가 연결돼 있어요." },
  { key: "outsideFood", label: "외부 음식", q: "밍글에 외부 음식을 가져와도 되나요?", yn: true, hint: "예: 냄새가 강하지 않은 간단한 간식은 괜찮아요." },
  { key: "pets", label: "반려동물", q: "밍글에 반려동물과 함께 갈 수 있나요?", yn: true, amenity: "반려동물 동반", hint: "예: 죄송하지만 반려동물은 함께 들어오실 수 없어요." },
  { key: "groups", label: "단체 · 대관", q: "밍글을 단체로 이용하거나 대관할 수 있나요?", yn: false, hint: "예: 대관은 하지 않지만, 여섯 명 이상 모임은 카카오톡으로 먼저 알려 주세요." },
  { key: "phone", label: "전화번호", q: "밍글에 전화로 문의할 수 있나요?", yn: false, hint: "예: 02-000-0000 (무인 매장이라 카카오톡이 더 빨라요)" },
];

const clipText = (v, max) =>
  String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** 저장 전 정리: { wifi: { state: "yes"|"no"|"", text }, ... } */
export function cleanFacts(input) {
  const out = {};
  for (const f of FACT_FIELDS) {
    const v = (input && input[f.key]) || {};
    const text = clipText(typeof v === "string" ? v : v.text, 160);
    const state = f.yn && ["yes", "no"].includes(v.state) ? v.state : "";
    if (text) out[f.key] = { state, text };
  }
  return out;
}

export const hasFacts = (facts) => !!facts && Object.keys(facts).some((k) => facts[k] && facts[k].text);

/** 매장 안내의 '알아 두면 좋은 것' 목록에 붙는 줄 */
export function factsRowsHtml(facts) {
  if (!hasFacts(facts)) return "";
  return FACT_FIELDS.filter((f) => facts[f.key] && facts[f.key].text)
    .map((f) => `<li data-fact="${f.key}"><span class="k">${esc(f.label)}</span><span class="v">${esc(facts[f.key].text)}</span></li>`)
    .join("");
}

/** 자주 묻는 질문에 붙는 항목 */
export function factsFaq(facts) {
  if (!hasFacts(facts)) return [];
  return FACT_FIELDS.filter((f) => facts[f.key] && facts[f.key].text).map((f) => ({ q: f.q, a: facts[f.key].text }));
}

export function factsFaqHtml(facts) {
  return factsFaq(facts)
    .map((f) => `<details><summary>${esc(f.q)}</summary><div class="a"><p>${esc(f.a)}</p></div></details>`)
    .join("");
}

/** 매장 구조화 데이터에 덧붙는 값 (같은 @id 로 합쳐집니다) */
export function factsLd(facts) {
  if (!hasFacts(facts)) return null;
  const amenity = FACT_FIELDS.filter((f) => f.amenity && facts[f.key] && facts[f.key].state)
    .map((f) => ({ "@type": "LocationFeatureSpecification", name: f.amenity, value: facts[f.key].state === "yes" }));
  const phone = facts.phone && (facts.phone.text.match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/) || [])[0];
  if (!amenity.length && !phone) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    "@id": STORE_ID,
    ...(amenity.length ? { amenityFeature: amenity } : {}),
    ...(phone ? { telephone: "+82-" + phone.replace(/^0/, "").replace(/\s/g, "-") } : {}),
  };
}

/* ============================================================
   IndexNow — 새로 올리거나 고친 주소를 검색엔진에 바로 알립니다.
   열쇠 파일: site/<INDEXNOW_KEY>.txt (빌드가 만듭니다)
   ============================================================ */
export const INDEXNOW_KEY = "8c1f4e7a2b9d4c36a5e07f1d3b8a6c92";
/* IndexNow는 한 곳에만 보내면 참여 검색엔진(네이버·빙 등)이 서로 나눠 갖습니다.
   네이버에 먼저 보내고, 네이버가 받지 못했을 때만 공용 주소로 한 번 더 보냅니다. */
const INDEXNOW_ENDPOINTS = [
  ["네이버", "https://searchadvisor.naver.com/indexnow"],
  ["IndexNow 공용(빙 등)", "https://api.indexnow.org/indexnow"],
];

/**
 * @param {string[]} urls  https://hellomingle.kr/ 로 시작하는 주소들
 * @returns {Promise<{name:string, status:number|null, ok:boolean}[]>}
 */
export async function indexNow(urls, fetchImpl = fetch) {
  const list = [...new Set((urls || []).filter((u) => typeof u === "string" && u.startsWith(ORIGIN + "/")))].slice(0, 5000);
  if (!list.length) return [];
  const body = JSON.stringify({
    host: new URL(ORIGIN).host,
    key: INDEXNOW_KEY,
    keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList: list,
  });
  const results = [];
  for (const [name, endpoint] of INDEXNOW_ENDPOINTS) {
    let status = null;
    try {
      const r = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
      status = r.status;
    } catch {}
    const ok = status !== null && status >= 200 && status < 300;
    results.push({ name, status, ok });
    if (ok) break;
  }
  return results;
}
