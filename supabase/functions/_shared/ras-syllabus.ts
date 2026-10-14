// RAS Mains (RPSC Combined Competitive Main Examination) syllabus for the
// descriptive General Studies papers I–III, from the scheme and syllabus dated
// 09-01-2026. Each question is matched to its nearest topic so SAATHI can follow
// the unit's conventions and use the unit's own blueprint. Paper IV (Hindi,
// English, essay) is a language paper and is not covered here.
//
// Scheme for papers I–III: 5-mark questions in about 50 words and 10-mark
// questions in about 150 words. Keep topic text stable: editing it re-embeds it.

export type SyllabusUnit = {
  id: string;
  paper: "I" | "II" | "III";
  unit: "I" | "II" | "III";
  title: string;
  // What good answers in this unit contain, added to SAATHI's instructions.
  hint: string;
  parts: { name: string; topics: string[] }[];
};

export const RAS_SYLLABUS: SyllabusUnit[] = [
  {
    id: "p1u1",
    paper: "I",
    unit: "I",
    title: "History, Art & Culture",
    hint: "Give names, dates, places and dynasties precisely, follow chronology, and bring in Rajasthan's rulers, sites, art forms, folk traditions and literature wherever relevant.",
    parts: [
      {
        name: "History, Art, Culture, Literature, Tradition and Heritage of Rajasthan",
        topics: [
          "Prehistoric cultures and ancient historic sites of Rajasthan and their importance",
          "Political and cultural achievements of rulers of Rajasthan up to the 18th century",
          "Revenue and administrative system of Rajasthan and its changing patterns",
          "Revolt of 1857, peasant and tribal movements, political awakening, praja mandal and mass movements, integration of Rajasthan",
          "Performing and fine arts, painting schools, handicrafts of Rajasthan",
          "Architecture, forts, palaces, temples, stepwells and monuments of Rajasthan",
          "Folk music, folk dances, folk instruments, folk stories and folklore of Rajasthan",
          "Fairs and festivals of Rajasthan",
          "Tribes of Rajasthan and their traditions",
          "Heritage and tourism sites of Rajasthan",
          "Rajasthani language, dialects and important literary works",
          "Religious beliefs, saints, sects and folk deities of Rajasthan",
        ],
      },
      {
        name: "Indian History & Culture",
        topics: [
          "Indian heritage: fine art, performing art, architecture and literature from the Indus civilization to the British era",
          "Religious movements and philosophy in ancient and medieval India, Bhakti and Sufi movements",
          "British policies and their political, economic and administrative impact on India",
          "Indian National Movement: stages, streams and important contributors",
          "Socio-religious reform movements of the 19th and 20th century and intellectual awakening",
          "Post-independence India: accession of princely states and linguistic reorganisation of states",
          "Development of science and technology in independent India",
          "Women empowerment and women reform movements in India",
        ],
      },
      {
        name: "History of Modern World (up to 1991)",
        topics: [
          "Renaissance and Reformation",
          "American War of Independence, French Revolution, Industrial Revolution and Russian Revolution",
          "Nazism in Germany and Fascism in Italy",
          "Impact of the World Wars and the world during the Cold War",
        ],
      },
    ],
  },
  {
    id: "p1u2",
    paper: "I",
    unit: "II",
    title: "Economics",
    hint: "Define the concept first, then use recent data and figures (growth rates, budget numbers, indices), name the relevant schemes and policies of India and Rajasthan, and end with the way forward.",
    parts: [
      {
        name: "Indian Economy",
        topics: [
          "Growth and development: concept and measurement, national income approaches, HDI and related indices",
          "Climate change and environmental degradation and the economy",
          "Agriculture: productivity, land reforms, agricultural finance and marketing, food security, food processing and policy initiatives",
          "Industry: industrial policy and reforms, liberalisation, privatisation and globalisation, industrial finance, MSMEs",
          "Service sector and infrastructure: energy, transportation and communication",
          "International trade, balance of payments, foreign aid and foreign investment",
          "Public finance: Union Budget, revenue and expenditure, budget deficit and public debt, fiscal policy and reforms",
          "Centre-state financial relations and the Finance Commission",
          "Reserve Bank of India, monetary management, banking and financial sector reforms",
          "Social sector: health, education, poverty, unemployment, employability schemes and welfare schemes for weaker sections",
        ],
      },
      {
        name: "World Economy",
        topics: ["Global economic issues and the role of WTO, World Bank and IMF"],
      },
      {
        name: "Economy of Rajasthan",
        topics: [
          "Economic growth indicators of Rajasthan: state domestic product, per capita income, inclusive growth, Viksit Rajasthan 2047",
          "Green growth, environmental sustainability and Rajasthan's position on the Sustainable Development Goals",
          "Rajasthan state budget, fiscal management and budget deficits",
          "Agricultural growth in Rajasthan: production, water resources and irrigation, animal husbandry, agricultural marketing, farmer welfare schemes",
          "Rural development, rural infrastructure, Panchayati Raj institutions and the State Finance Commission",
          "Industrial development of Rajasthan: institutions, investment promotion policy, MSME policy, petroleum and oil resources",
          "Infrastructure of Rajasthan: power, transport, public-private partnership and externally aided projects",
          "Human resource development in Rajasthan: health, education, unemployment, poverty, employment generation schemes",
          "Good governance and digital transformation of public services in Rajasthan",
          "Welfare schemes of Rajasthan for SC/ST/backward classes, minorities, disabled persons, destitute, women, children and the elderly",
        ],
      },
    ],
  },
  {
    id: "p1u3",
    paper: "I",
    unit: "III",
    title: "Sociology, Management, Accounting & Auditing",
    hint: "Define the concept precisely, use the standard theories, models and thinkers by name, and give Indian (and Rajasthan) social or workplace examples; for accounting and auditing, follow standard terms and formats.",
    parts: [
      {
        name: "Sociology",
        topics: [
          "Caste and class and their changing dimensions in Indian society",
          "Secularisation, urbanisation, modernisation and globalisation in contemporary Indian society",
          "Doctrine of Karma, Dharma, Purushartha and Ashram system",
          "Family and marriage, elderly and disabled people, cyber crime and social media in Indian society",
          "Social problems: dowry, divorce, corruption, poverty, prostitution, unemployment and drug addiction",
          "Problems and welfare of weaker sections in Rajasthan: women, marginalised groups, Dalits, SC and ST",
        ],
      },
      {
        name: "Management",
        topics: [
          "Concept of management, managerial skills and levels, management functions, MBO, decision making models",
          "Organisational behaviour: perception, motivation theories, group dynamics, team building, organisational culture",
          "Marketing management: marketing mix, product, pricing, promotion, distribution, service and digital marketing",
          "Human resource management: planning, recruitment, selection, training, performance appraisal, modern trends",
          "Strategic management: business environment, SWOT analysis, strategy formulation, implementation and control",
        ],
      },
      {
        name: "Accounting & Auditing",
        topics: [
          "Generally accepted accounting principles and accounting concepts, accounting standards",
          "Financial statements of a company, financial statement analysis, cash flow statement, responsibility and social accounting",
          "Computerised accounting and Goods and Services Tax basics",
          "Auditing: meaning, objectives, audit programme, social, performance and efficiency audit, government audit",
        ],
      },
    ],
  },
  {
    id: "p2u1",
    paper: "II",
    unit: "I",
    title: "Administrative Ethics",
    hint: "Ground the answer in ethical concepts and thinkers (Gita, Gandhi, Indian and Western philosophers), illustrate with examples from public administration, and for case studies identify stakeholders and the dilemma, weigh options and justify one course of action.",
    parts: [
      {
        name: "Administrative Ethics",
        topics: [
          "Ethics and human values, lessons from great leaders, reformers and administrators, role of family, society and education",
          "Rit and Rin, Karmavada, concept of duty, good and virtue",
          "Ethics in private and public relationships, integrity, impartiality and non-partisanship, transparency, media and bureaucracy",
          "Ethics of the Bhagavad Gita and its role in administration",
          "Gandhian ethics",
          "Contribution of moral thinkers and philosophers from India and the world",
          "Ethical concerns and dilemmas in administration, artificial intelligence versus conscience in decision making",
          "Basis of ethical decision making: social justice, humanitarian concerns, accountability, instrumental versus value rationality",
          "Ethics case studies on administrative dilemmas",
        ],
      },
    ],
  },
  {
    id: "p2u2",
    paper: "II",
    unit: "II",
    title: "General Science & Technology",
    hint: "Start with a precise scientific definition or principle, explain the mechanism simply (a labelled diagram or flowchart helps), give everyday, health, agricultural or industrial applications, and mention Indian and Rajasthan initiatives where relevant.",
    parts: [
      {
        name: "Chemistry",
        topics: [
          "Chemistry in everyday life, atomic structure, metals, non-metals, metallurgy, ores and alloys",
          "Acids, bases and salts, pH and buffers",
          "Drugs, antioxidants, preservatives, pesticides, fertilisers, binders and sweeteners",
          "Carbon compounds, fuels and octane rating, radioactivity and green chemistry",
        ],
      },
      {
        name: "Physics",
        topics: [
          "Motion, work, power, energy and gravitation",
          "Light, heat, sound, electricity, magnetism and electromagnetic waves",
          "Physics in medical diagnostics, nuclear fission and fusion, radiation safety",
        ],
      },
      {
        name: "Biology",
        topics: [
          "The cell, plant parts, plant nutrition, growth regulators and reproduction in plants",
          "Human physiology: digestion, respiration, circulation, excretion, reproduction and nervous system",
          "Food and nutrition, immunity, diseases and public health initiatives",
          "Microbes, fermentation, biotechnology, genetic engineering and GM organisms",
          "Recent advances: vaccines, CRISPR, mRNA technology and artificial organs",
        ],
      },
      {
        name: "Computers, ICT and emerging technology",
        topics: [
          "Computer basics, networking, telecommunication, frequency spectrum and mobile telephony",
          "Artificial intelligence, machine learning, big data, cloud and edge computing, internet of things",
          "Blockchain, digital currency, virtual and augmented reality, OTT platforms and social media",
          "Indian scientists, scientific institutions, robotics, nanotechnology and quantum computing",
          "Science and technology policy in India and Rajasthan, Digital India, cyber security and data privacy",
        ],
      },
      {
        name: "Space and Defence",
        topics: [
          "Indian space programme, satellites, launch vehicles and remote sensing",
          "Defence research, indigenous technologies, missile programme, drones, chemical and biological weapons",
        ],
      },
    ],
  },
  {
    id: "p2u3",
    paper: "II",
    unit: "III",
    title: "Earth Science (Geography & Geology)",
    hint: "Use correct geographical terms, name specific regions, districts, rivers and places (especially in Rajasthan), give data where the material has it, and add a simple map sketch or diagram description when it helps.",
    parts: [
      {
        name: "World",
        topics: [
          "Interior of the earth and geological time scale",
          "Mountains, plateaus, plains and deserts: types and distribution",
          "Earthquakes and volcanoes: types, distribution and impact",
          "Climate: insolation, atmospheric circulation, humidity and precipitation",
          "Major environmental issues",
        ],
      },
      {
        name: "India",
        topics: [
          "Physiography of India",
          "Drainage pattern and important rivers of India",
          "Monsoon, climate, rainfall distribution and climatic regions of India",
          "Natural resources of India: water, vegetation, soil, minerals and power",
          "Population of India: growth, density, sex ratio, literacy, urban and rural population",
        ],
      },
      {
        name: "Rajasthan",
        topics: [
          "Physiography of Rajasthan",
          "Rivers and lakes of Rajasthan",
          "Climate of Rajasthan and its classification",
          "Natural vegetation, wildlife and biodiversity of Rajasthan",
          "Soils of Rajasthan",
          "Agriculture of Rajasthan: major crops, production and distribution",
          "Mineral resources of Rajasthan: types, distribution and industrial uses",
          "Demography of Rajasthan",
          "Tribes of Rajasthan",
          "UNESCO geoparks and geo-heritage sites: potential in Rajasthan",
          "Tourism in Rajasthan",
        ],
      },
    ],
  },
  {
    id: "p3u1",
    paper: "III",
    unit: "I",
    title: "Polity, Governance, International Affairs & Current Affairs",
    hint: "Cite constitutional articles, amendments, landmark judgments and committees precisely, include Rajasthan's institutions and politics where asked, and use current examples and data.",
    parts: [
      {
        name: "Constitution of India",
        topics: [
          "Constituent Assembly, sources and philosophy of the Constitution, Fundamental Rights, Directive Principles and Fundamental Duties",
          "Basic structure doctrine, amendment process and major constitutional changes",
          "Recent constitutional developments, judicial pronouncements, constitutional morality and transformative constitutionalism",
        ],
      },
      {
        name: "Institutions & Governance",
        topics: [
          "President, Vice President, Prime Minister, Council of Ministers and Parliament",
          "Emerging trends in Indian federalism",
          "Supreme Court, High Courts, judicial review, judicial activism, virtual courts and e-Courts",
        ],
      },
      {
        name: "Dynamics of Indian Polity",
        topics: [
          "Party system, regionalism and coalition politics in Indian democracy",
          "Issue-based and inclusive politics, women's participation, AI-enabled political mobilisation",
          "Voting behaviour, electoral reforms and elections in India",
          "Internal security: threats, security forces and agencies",
        ],
      },
      {
        name: "Rajasthan Politics & Governance",
        topics: [
          "Political participation, leadership, parties and electoral behaviour in Rajasthan",
          "Panchayati Raj and urban local self-government in Rajasthan: structure, issues and challenges",
          "Public policy making in Rajasthan: institutions, processes, stakeholders and implementation",
          "E-governance initiatives of Rajasthan: achievements and challenges",
        ],
      },
      {
        name: "International Affairs",
        topics: [
          "Post-Cold War world order, multipolarity, global political economy and international terrorism",
          "Indian foreign policy, relations with major powers and neighbours, diaspora and cultural diplomacy",
          "India in UN, WTO, EU, ASEAN, BRICS, G-20, QUAD, I2U2 and other platforms",
          "India's climate and green diplomacy: COP summits, International Solar Alliance, Mission LiFE",
        ],
      },
      {
        name: "Current Affairs",
        topics: [
          "Important current events, issues and personalities",
          "Key public welfare schemes and initiatives of Rajasthan",
          "Awards, literature, science, technology and ICT advancements",
          "Sports policies, institutions and achievements of India and Rajasthan",
          "Role of yoga in health, wellness and stress management",
        ],
      },
    ],
  },
  {
    id: "p3u2",
    paper: "III",
    unit: "II",
    title: "Public Administration",
    hint: "Define the concept, name the theories and thinkers (Taylor, Mayo, Simon, Riggs and others), cite constitutional or statutory provisions for institutions, and give Indian and Rajasthan administrative examples.",
    parts: [
      {
        name: "Theories and Principles",
        topics: [
          "Meaning, nature, scope and evolution of public administration, new public administration, new public management, good governance, new public service",
          "Scientific management, human relations, behavioural, structural-functional and ecological approaches",
          "Principles of organisation: hierarchy, unity of command, span of control, delegation, centralisation, coordination, accountability",
          "Administrative behaviour: leadership, communication and morale",
        ],
      },
      {
        name: "Union Government and Institutions",
        topics: [
          "UPSC, Election Commission, CAG, Finance Commission, Lokpal and NITI Aayog",
          "Personnel administration: recruitment, training, promotion, neutrality, anonymity and code of conduct",
          "Union-state relations, minister-civil servant relations, generalists versus specialists, administrative reforms, social audit",
          "Legislative, executive and judicial control over administration",
        ],
      },
      {
        name: "Comparative Public Administration",
        topics: ["Administrative systems of the USA, UK, France and China"],
      },
      {
        name: "State & District Administration",
        topics: [
          "Governor, Chief Minister, Council of Ministers, State Secretariat, Chief Secretary and directorates",
          "Police administration, Board of Revenue, State Election Commission, State Human Rights Commission and Lokayukta",
          "District Collector, law and order, revenue and development administration",
        ],
      },
    ],
  },
  {
    id: "p3u3",
    paper: "III",
    unit: "III",
    title: "Behaviour & Law",
    hint: "For behaviour, name the theories and models and apply them to the workplace; for law, cite the act, year and exact section numbers and definitions, and explain the provision's purpose and effect.",
    parts: [
      {
        name: "Behaviour",
        topics: [
          "Cognitive, social, emotional, cultural, appreciative and spiritual intelligence at the workplace",
          "Leadership theories, types and styles at the workplace",
          "Workplace communication: models, networks, barriers, cyberslacking, cyberloafing and moonlighting",
          "Flourishing at work: virtues and strengths, RIASEC model, person-environment fit",
          "Burnout, occupational stress, coping styles and gender issues at the workplace",
        ],
      },
      {
        name: "Law",
        topics: [
          "Right to Information Act, 2005",
          "Information Technology Act, 2000: definitions and cyber offences",
          "Intellectual property rights: concepts, types and purpose",
          "Protection of Women from Domestic Violence Act, 2005",
          "Sexual Harassment of Women at Workplace Act, 2013",
          "Protection of Children from Sexual Offences (POCSO) Act, 2012",
          "Maintenance and Welfare of Parents and Senior Citizens Act, 2007",
          "Rajasthan Tenancy Act, 1955",
          "Rajasthan Land Revenue Act, 1956",
          "Bharatiya Nyaya Sanhita, 2023",
          "Bharatiya Nagarik Suraksha Sanhita, 2023",
        ],
      },
    ],
  },
];

export type SyllabusTopic = {
  id: string;
  unit_id: string;
  paper: string;
  unit_title: string;
  part: string;
  topic: string;
};

// Every topic with a stable id like "p1u1.0.4" (unit, part, topic index).
export function syllabusTopics(): SyllabusTopic[] {
  return RAS_SYLLABUS.flatMap((u) =>
    u.parts.flatMap((p, pi) =>
      p.topics.map((topic, ti) => ({
        id: `${u.id}.${pi}.${ti}`,
        unit_id: u.id,
        paper: u.paper,
        unit_title: u.title,
        part: p.name,
        topic,
      })),
    ),
  );
}

// The text embedded for matching questions to topics.
export function topicEmbeddingText(t: SyllabusTopic): string {
  return `${t.unit_title} › ${t.part}: ${t.topic}`;
}

export function syllabusUnit(id: string | null | undefined): SyllabusUnit | undefined {
  return id ? RAS_SYLLABUS.find((u) => u.id === id) : undefined;
}

export function unitLabel(id: string | null | undefined): string {
  const u = syllabusUnit(id);
  return u ? `Paper ${u.paper} · Unit ${u.unit} · ${u.title}` : "";
}

// "Paper: II" and "Unit: I" (Roman or Arabic numerals) to a unit id.
export function unitFromPaper(paper: string | null | undefined, unit: string | null | undefined) {
  const roman = (v: string | null | undefined) => {
    const s = (v ?? "")
      .trim()
      .toUpperCase()
      .replace(/^(PAPER|UNIT)\s*/, "");
    return (
      { "1": "I", "2": "II", "3": "III", I: "I", II: "II", III: "III" } as Record<string, string>
    )[s];
  };
  const p = roman(paper);
  const u = roman(unit);
  return RAS_SYLLABUS.find((x) => x.paper === p && x.unit === u)?.id ?? null;
}
