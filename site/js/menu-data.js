/* ============================================================
   밍글 메뉴 데이터 — 이 파일 하나만 고치면 홈·메뉴·영어 페이지·관리자에 모두 반영됩니다.

   price: null  → 화면에 "매장 가격표"로 표시됩니다. 숫자를 넣으면 그 가격이 나옵니다.
   img:   null  → 사진 없이 이름만 나옵니다. 사진을 넣으려면
                  site/img/p/ 폴더에 정사각형 이미지를 두고 파일명을 적어 주세요.
                  예: img: 'coldbrew'  →  site/img/p/coldbrew.webp
   new:   true  → NEW 배지가 붙습니다.
   ============================================================ */

window.MINGLE_MENU = {
  updated: "2026-08",
  note: "가격과 구성은 매장 사정에 따라 바뀔 수 있어요. 실제 가격은 매장 가격표와 키오스크 기준입니다.",

  groups: [
    {
      id: "coffee",
      ko: "커피",
      en: "Coffee",
      desc: "원두는 매장 머신에서 바로 내립니다.",
      items: [
        { id: "americano", ko: "아메리카노", en: "Americano", price: null, img: null },
        { id: "cafelatte", ko: "카페라떼", en: "Cafe Latte", price: null, img: null },
        { id: "coldbrew", ko: "콜드브루", en: "Cold Brew", price: null, img: null },
        { id: "vanillalatte", ko: "아이스 바닐라 라떼", en: "Iced Vanilla Latte", price: null, img: null },
      ],
    },
    {
      id: "nonco",
      ko: "논커피 · 에이드",
      en: "Non-coffee & Ade",
      desc: "커피를 안 드시는 분들이 제일 많이 찾는 쪽이에요.",
      items: [
        { id: "matcha", ko: "제주 말차 라떼", en: "Jeju Matcha Latte", price: null, img: null },
        { id: "milktea", ko: "밀크티", en: "Milk Tea", price: null, img: null },
        { id: "peachtea", ko: "복숭아 아이스티", en: "Peach Iced Tea", price: null, img: null },
        { id: "strawberryade", ko: "딸기 에이드", en: "Strawberry Ade", price: null, img: null },
        { id: "bluelemonade", ko: "블루 레몬에이드", en: "Blue Lemonade", price: null, img: null },
        { id: "grapefruitade", ko: "자몽 스파클링 에이드", en: "Grapefruit Sparkling Ade", price: null, img: null },
      ],
    },
    {
      id: "chilled",
      ko: "냉장 디저트",
      en: "Chilled Desserts",
      desc: "쇼케이스 냉장고에 있습니다. 그날 들어온 것만 놓여 있어요.",
      items: [
        { id: "cake", ko: "조각 케이크", en: "Cake Slice", price: null, img: null },
        { id: "pudding", ko: "푸딩", en: "Pudding", price: null, img: null },
        { id: "cupdessert", ko: "컵 디저트", en: "Cup Dessert", price: null, img: null },
      ],
    },
    {
      id: "baked",
      ko: "구움과자 · 포장 디저트",
      en: "Baked & Packaged",
      desc: "선반에 있어요. 포장이라 들고 나가기 좋습니다.",
      items: [
        { id: "cookie", ko: "쿠키", en: "Cookie", price: null, img: null },
        { id: "brownie", ko: "브라우니", en: "Brownie", price: null, img: null },
        { id: "financier", ko: "휘낭시에", en: "Financier", price: null, img: null },
        { id: "madeleine", ko: "마들렌", en: "Madeleine", price: null, img: null },
      ],
    },
  ],
};
