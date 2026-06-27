export const RECOVERY_CONTENT = {
  defaultProcedureDate: '2026-06-26',
  timeline: [
    {
      id: 'day_0',
      title: 'Day 0',
      fromDay: 0,
      toDay: 0,
      stageId: 'heat_swelling',
      keyTakeaway: 'Heat peaks and swelling begins. Keep the area still and calm.'
    },
    {
      id: 'day_1',
      title: 'Day 1',
      fromDay: 1,
      toDay: 1,
      stageId: 'red_warm_tight',
      keyTakeaway: 'Expect redness, warmth, and tightness. Maintain full routine.'
    },
    {
      id: 'days_2_3',
      title: 'Days 2-3',
      fromDay: 2,
      toDay: 3,
      stageId: 'mends_bronzing',
      keyTakeaway: 'MENDs/bronzing and texture shifts are common. Avoid picking.'
    },
    {
      id: 'days_4_7',
      title: 'Days 4-7',
      fromDay: 4,
      toDay: 7,
      stageId: 'flaking_peeling',
      keyTakeaway: 'Skin sheds visible flakes. Keep hydrated and do not exfoliate.'
    },
    {
      id: 'week_2_plus',
      title: 'Week 2+',
      fromDay: 8,
      toDay: Number.POSITIVE_INFINITY,
      stageId: 'peeled_calm_reintroduction',
      keyTakeaway: 'Reintroduce actives only once calm and peeled.'
    }
  ],
  stages: {
    heat_swelling: {
      id: 'heat_swelling',
      title: 'Heat and swelling',
      summary: 'Heat peaks and swelling is possible. No actives or sweat.'
    },
    red_warm_tight: {
      id: 'red_warm_tight',
      title: 'Red, warm, tight',
      summary: 'Redness, heat, and tightness are common in this phase.'
    },
    mends_bronzing: {
      id: 'mends_bronzing',
      title: 'MENDS / bronzing',
      summary: 'MENDS and bronzing texture are expected; do not pick.'
    },
    flaking_peeling: {
      id: 'flaking_peeling',
      title: 'Flaking and peeling',
      summary: 'Skin is shedding and calming; avoid scrubbing or exfoliating.'
    },
    peeled_calm_reintroduction: {
      id: 'peeled_calm_reintroduction',
      title: 'Peeled, calm, reintroduction',
      summary: 'Skin appears fresh and brighter; reintroduce only if calm.'
    }
  },
  treatedAreas: [
    { id: 'face', title: 'Face' },
    { id: 'neck', title: 'Neck' },
    { id: 'hands', title: 'Hands' }
  ],
  standingRules: {
    acyclovir: {
      title: 'Take acyclovir',
      details: 'Finish the full prescription even if symptoms settle.'
    },
    sunscreen: {
      title: 'Sunscreen',
      details: 'Use physical SPF 30-50 daily for at least 3 months; reapply with exposure.'
    },
    hatClothing: {
      title: 'Hat and clothing',
      details: 'Wear a wide-brim hat and protective clothing for 2 months; avoid sun 10:00-14:30.'
    },
    donts: {
      title: "Don'ts",
      details: 'No picking MENDs/flakes, no scrubbing/exfoliating, no sweat/sauna/gym until healed, no actives yet.'
    }
  },
  routine: {
    am: [
      { id: 'cleanse', label: 'Cleanse', details: 'Use lukewarm water and gentle cleanser.' },
      { id: 'thermal_water', label: 'Thermal water', details: 'Pat on as needed.' },
      { id: 'alastin', label: 'Alastin Skin Nectar', details: 'Apply a thin layer.' },
      { id: 'cicalfate', label: 'Cicalfate+', details: 'Apply occlusive layer.' },
      { id: 'spf', label: 'Physical SPF', details: 'Apply broad-spectrum SPF 30-50.' }
    ],
    pm: [
      { id: 'cleanse', label: 'Cleanse', details: 'Use lukewarm water and gentle cleanser.' },
      { id: 'hocl', label: 'HOCl spray', details: 'Air-dry 30-60 seconds.' },
      { id: 'alastin', label: 'Alastin Skin Nectar', details: 'Apply a thin layer.' },
      { id: 'cicalfate', label: 'Cicalfate+', details: 'Apply occlusive layer.' },
      { id: 'spf', label: 'Physical SPF', details: 'Apply broad-spectrum SPF 30-50.' }
    ]
  }
};

export const SAFETY_TRIGGERS = [
  'pus or drainage',
  'increasing warmth',
  'spreading redness',
  'fever',
  'extreme itching',
  'blistering',
  'oozing',
  'sharply-demarcated burn-like areas',
  'severe or asymmetric eye swelling'
];

export const CLINIC_CONTACTS = [
  { label: 'EDINA Skin Artisans', phone: '952-767-3163', availability: 'weekday and weekend' },
  { label: 'On-call physician', phone: '952-925-1165', note: 'if no reply within 30 min' }
];

export const GUIDANCE_GROUPS = {
  exercise: {
    status: 'wait',
    title: 'Keep activity light',
    details: 'Walking is okay; avoid lifting until redness and heat remain calm.',
    reviewAfter: 'next_checkin'
  },
  heatColdExposure: {
    status: 'wait',
    title: 'Avoid sauna and cold plunge',
    details: 'Heat and cold stress can aggravate redness while barrier is reactive.',
    reviewAfter: 'next_checkin'
  },
  actives: {
    status: 'wait',
    title: 'Do not restart actives yet',
    details: 'Avoid actives until peeled and calm; reintroduce slowly when advised.',
    reviewAfter: 'next_checkin'
  },
  cosmeticsCoverage: {
    status: 'limited',
    title: 'Tinted mineral SPF only',
    details: 'Use minimal coverage only after peeling completes and skin is calm.',
    reviewAfter: 'next_checkin'
  }
};
