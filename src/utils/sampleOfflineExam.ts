import { Exam, Question } from '../types';
import { generateBatchSets } from './omrPdfGenerator';

/**
 * 100 MCQs exactly matching the Demo PDF (Unique_omr__543b9b86.pdf)
 * Covering General Science, Biology, Chemistry & Physics
 */
export const DEMO_100_QUESTIONS: Array<{
  q: string;
  a: string;
  b: string;
  c: string;
  d: string;
  ans: 'A' | 'B' | 'C' | 'D';
  exp?: string;
}> = [
  { q: "What is the SI unit of electric current?", a: "Volt", b: "Ampere", c: "Ohm", d: "Watt", ans: "B", exp: "Ampere (A) is the base SI unit of electric current." },
  { q: "Which gas is most abundant in Earth's atmosphere?", a: "Oxygen", b: "Hydrogen", c: "Nitrogen", d: "Carbon Dioxide", ans: "C", exp: "Nitrogen makes up approximately 78% of Earth's atmosphere." },
  { q: "The process of plant food synthesis is called:", a: "Respiration", b: "Photosynthesis", c: "Transpiration", d: "Osmosis", ans: "B", exp: "Plants synthesize glucose using sunlight, water and CO2 via photosynthesis." },
  { q: "What is the chemical formula of Table Salt?", a: "NaCl", b: "KCl", c: "CaCO3", d: "NaOH", ans: "A", exp: "Table salt is Sodium Chloride (NaCl)." },
  { q: "Who proposed the theory of General Relativity?", a: "Isaac Newton", b: "Albert Einstein", c: "Niels Bohr", d: "Galileo Galilei", ans: "B", exp: "Albert Einstein published General Relativity in 1915." },
  { q: "Which blood group is known as universal recipient?", a: "A Positive", b: "O Negative", c: "AB Positive", d: "B Positive", ans: "C", exp: "AB+ individuals have both A and B antigens and Rh factor with no antibodies." },
  { q: "What is the primary function of white blood cells?", a: "Transport oxygen", b: "Fight infection", c: "Clot blood", d: "Digest food", ans: "B", exp: "White blood cells (leukocytes) form the immune defense system." },
  { q: "Which planet is known as the Red Planet?", a: "Venus", b: "Mars", c: "Jupiter", d: "Saturn", ans: "B", exp: "Mars appears red due to abundant iron oxide on its surface." },
  { q: "What is the powerhouse of the cell?", a: "Ribosome", b: "Mitochondria", c: "Nucleus", d: "Endoplasmic Reticulum", ans: "B", exp: "Mitochondria generate ATP via cellular respiration." },
  { q: "Which organ produces insulin in the human body?", a: "Liver", b: "Pancreas", c: "Kidney", d: "Spleen", ans: "B", exp: "Beta cells of Islets of Langerhans in the pancreas secrete insulin." },
  { q: "What is the pH of pure water at 25°C?", a: "5", b: "7", c: "9", d: "14", ans: "B", exp: "Pure neutral water has a neutral pH of 7.0." },
  { q: "Which element has the chemical symbol Fe?", a: "Fluorine", b: "Iron", c: "Francium", d: "Fermium", ans: "B", exp: "Fe comes from the Latin word Ferrum meaning Iron." },
  { q: "Which blood group is known as universal donor?", a: "A Positive", b: "B Positive", c: "AB Positive", d: "O Negative", ans: "D", exp: "O- red blood cells lack A, B and Rh surface antigens." },
  { q: "What is the acceleration due to gravity on Earth?", a: "9.8 m/s²", b: "8.9 m/s²", c: "10.2 m/s²", d: "9.1 m/s²", ans: "A", exp: "Standard gravitational acceleration g = 9.80665 m/s²." },
  { q: "Essential element for bone development is:", a: "Iron", b: "Calcium", c: "Iodine", d: "Zinc", ans: "B", exp: "Calcium and Phosphorus form hydroxyapatite in bone matrix." },
  { q: "The hardest natural substance known on Earth:", a: "Gold", b: "Iron", c: "Diamond", d: "Platinum", ans: "C", exp: "Diamond has a giant covalent carbon lattice with Mohs hardness 10." },
  { q: "Which instrument measures atmospheric pressure?", a: "Barometer", b: "Thermometer", c: "Hydrometer", d: "Anemometer", ans: "A", exp: "Torricelli invented the mercury barometer to measure air pressure." },
  { q: "Light year is a unit of:", a: "Time", b: "Distance", c: "Speed", d: "Intensity", ans: "B", exp: "A light-year is the astronomical distance light travels in one Julian year." },
  { q: "Which vitamin is synthesized in human skin by sunlight?", a: "Vitamin A", b: "Vitamin B", c: "Vitamin C", d: "Vitamin D", ans: "D", exp: "UVB rays convert 7-dehydrocholesterol into cholecalciferol (Vitamin D3)." },
  { q: "Deficiency of Vitamin C causes:", a: "Beriberi", b: "Scurvy", c: "Rickets", d: "Night Blindness", ans: "B", exp: "Lack of ascorbic acid prevents collagen synthesis causing scurvy." },
  { q: "What is the chemical symbol for Gold?", a: "Ag", b: "Au", c: "Fe", d: "Cu", ans: "B", exp: "Au comes from the Latin word Aurum." },
  { q: "Which metal is liquid at room temperature?", a: "Mercury", b: "Sodium", c: "Lead", d: "Calcium", ans: "A", exp: "Mercury (Hg) is a transition metal with melting point -38.83°C." },
  { q: "What is the main gas in Natural Gas?", a: "Propane", b: "Methane", c: "Butane", d: "Ethane", ans: "B", exp: "Methane (CH4) typically comprises 80-95% of natural gas." },
  { q: "Sound waves cannot travel through:", a: "Solids", b: "Liquids", c: "Gases", d: "Vacuum", ans: "D", exp: "Mechanical sound waves require a physical medium to propagate." },
  { q: "Which hormone regulates blood sugar levels?", a: "Adrenaline", b: "Insulin", c: "Thyroxine", d: "Estrogen", ans: "B", exp: "Insulin facilitates cellular uptake of glucose from the bloodstream." },
  { q: "Dry Ice is the solid form of:", a: "Water", b: "Nitrogen", c: "Carbon Dioxide", d: "Methane", ans: "C", exp: "Dry ice is solid CO2 which sublimes directly at -78.5°C." },
  { q: "Which layer protects Earth from ultraviolet rays?", a: "Ionosphere", b: "Ozone Layer", c: "Troposphere", d: "Mesosphere", ans: "B", exp: "The stratospheric ozone layer (O3) absorbs harmful UV-B radiation." },
  { q: "Which element is liquid at room temperature?", a: "Mercury", b: "Sodium", c: "Lead", d: "Calcium", ans: "A", exp: "Mercury (Hg) remains liquid at room temperature." },
  { q: "What is the main component of Biogas?", a: "Methane", b: "Hydrogen", c: "Nitrogen", d: "Carbon Monoxide", ans: "A", exp: "Anaerobic digestion produces biogas containing 50-70% methane." },
  { q: "Sound frequency below 20 Hz is called:", a: "Ultrasonic", b: "Infrasonic", c: "Supersonic", d: "Audible", ans: "B", exp: "Frequencies below the 20 Hz human hearing threshold are infrasonic." },
  { q: "Newton's First Law of Motion defines:", a: "Force", b: "Inertia", c: "Momentum", d: "Energy", ans: "B", exp: "Newton's 1st law is also known as the Law of Inertia." },
  { q: "Power of a lens is measured in:", a: "Diopter", b: "Lumen", c: "Candela", d: "Lux", ans: "A", exp: "Diopter (D = 1/f in meters) measures optical power." },
  { q: "Master gland of the human body is:", a: "Thyroid", b: "Pituitary", c: "Adrenal", d: "Pancreas", ans: "B", exp: "The pituitary gland controls other endocrine glands via trophic hormones." },
  { q: "Speed of light in vacuum is approximately:", a: "3×10⁸ m/s", b: "3×10⁶ m/s", c: "3×10¹⁰ m/s", d: "3×10⁵ m/s", ans: "A", exp: "The speed of light c = 299,792,458 m/s ≈ 3×10⁸ m/s." },
  { q: "Vitamin deficiency causing Scurvy:", a: "Vitamin A", b: "Vitamin C", c: "Vitamin D", d: "Vitamin B12", ans: "B", exp: "Vitamin C (ascorbic acid) deficiency leads to bleeding gums and scurvy." },
  { q: "What is the chemical symbol for Silver?", a: "Au", b: "Ag", c: "Si", d: "Sn", ans: "B", exp: "Ag is derived from Argentum." },
  { q: "Which mirror is used by dentists to inspect teeth?", a: "Convex", b: "Concave", c: "Plane", d: "Cylindrical", ans: "B", exp: "A concave mirror provides an upright, enlarged virtual image." },
  { q: "Rusting of iron is an example of:", a: "Reduction", b: "Oxidation", c: "Polymerization", d: "Hydrolysis", ans: "B", exp: "Iron reacts with oxygen and water to form hydrated iron(III) oxide." },
  { q: "Energy stored in a stretched spring is:", a: "Kinetic", b: "Potential", c: "Thermal", d: "Chemical", ans: "B", exp: "Elastic potential energy U = 1/2 k x² is stored in the stretched spring." },
  { q: "Human heart has how many chambers?", a: "Two", b: "Three", c: "Four", d: "Six", ans: "C", exp: "The mammalian heart has two atria and two ventricles." },
  { q: "What is the charge of a neutron?", a: "Positive", b: "Negative", c: "Neutral (Zero)", d: "Variable", ans: "C", exp: "Neutrons carry no electric net charge." },
  { q: "SI unit of electric resistance is:", a: "Volt", b: "Ohm", c: "Farad", d: "Henry", ans: "B", exp: "Ohm (Ω) is the SI unit of electrical resistance." },
  { q: "Which cell organelle is called Powerhouse?", a: "Ribosome", b: "Mitochondria", c: "Nucleus", d: "Lysosome", ans: "B", exp: "Mitochondria synthesize energy-rich ATP molecules." },
  { q: "Speed of sound in dry air at 20°C is approximately:", a: "343 m/s", b: "3000 m/s", c: "150 m/s", d: "3×10⁸ m/s", ans: "A", exp: "In dry air at 20°C, speed of sound is roughly 343 meters per second." },
  { q: "Element necessary for blood clotting is:", a: "Iron", b: "Calcium", c: "Potassium", d: "Sodium", ans: "B", exp: "Calcium ions (Factor IV) are critical cofactors for clotting cascade." },
  { q: "Solder alloy consists of:", a: "Lead & Tin", b: "Copper & Zinc", c: "Iron & Nickel", d: "Gold & Silver", ans: "A", exp: "Traditional soft solder is an alloy of lead (Pb) and tin (Sn)." },
  { q: "Chemical formula of Ozone:", a: "O2", b: "O3", c: "H2O2", d: "CO2", ans: "B", exp: "Ozone is a triatomic molecule consisting of three oxygen atoms." },
  { q: "Instrument to measure heartbeats:", a: "Stethoscope", b: "Sphygmomanometer", c: "ECG", d: "EEG", ans: "A", exp: "Physicians use stethoscopes for auscultation of heart and lung sounds." },
  { q: "Escape velocity from Earth surface is approximately:", a: "11.2 km/s", b: "9.8 km/s", c: "15.0 km/s", d: "7.9 km/s", ans: "A", exp: "Escape velocity v = √(2GM/R) ≈ 11.186 km/s." },
  { q: "Which metal is the best conductor of electricity?", a: "Copper", b: "Silver", c: "Aluminum", d: "Gold", ans: "B", exp: "Silver (Ag) has the highest electrical conductivity of all metals." },
  { q: "Normal body temperature in Celsius is approximately:", a: "37°C", b: "98.6°C", c: "32°C", d: "40°C", ans: "A", exp: "Normal human body core temperature is roughly 36.5–37.5°C." },
  { q: "Study of fossils is called:", a: "Botany", b: "Paleontology", c: "Geology", d: "Ecology", ans: "B", exp: "Paleontology investigates ancient prehistoric life through fossil remains." },
  { q: "Gas used in fire extinguishers:", a: "Oxygen", b: "Nitrogen", c: "Carbon Dioxide", d: "Argon", ans: "C", exp: "CO2 suffocates flames by displacing oxygen without leaving residue." },
  { q: "Transformer works on principle of:", a: "Mutual Induction", b: "Self Induction", c: "Electrostatics", d: "Resistance", ans: "A", exp: "Transformers transfer alternating electric energy via mutual electromagnetic induction." },
  { q: "Chemical name of Baking Soda is:", a: "Sodium Carbonate", b: "Sodium Bicarbonate", c: "Calcium Carbonate", d: "Sodium Hydroxide", ans: "B", exp: "Baking soda is sodium hydrogen carbonate / sodium bicarbonate (NaHCO3)." },
  { q: "Universal solvent in chemistry is:", a: "Alcohol", b: "Water", c: "Ether", d: "Acetone", ans: "B", exp: "Water dissolves more substances than any other liquid due to its polar nature." },
  { q: "Units of work and energy are:", a: "Joule", b: "Watt", c: "Newton", d: "Pascal", ans: "A", exp: "1 Joule = 1 Newton-meter of work performed." },
  { q: "Deficiency of Iodine causes:", a: "Anemia", b: "Goitre", c: "Rickets", d: "Beriberi", ans: "B", exp: "Iodine is essential for thyroid hormones T3 and T4; deficiency enlarges thyroid (goitre)." },
  { q: "What is the SI unit of pressure?", a: "Pascal", b: "Newton", c: "Joule", d: "Watt", ans: "A", exp: "Pascal (Pa) equals one Newton per square meter (N/m²)." },
  { q: "Which plant tissue transports water and minerals?", a: "Phloem", b: "Xylem", c: "Cambium", d: "Epidermis", ans: "B", exp: "Xylem vessels conduct water unidirectionally from roots to leaves." },
  { q: "Which plant tissue conducts food and sugars?", a: "Phloem", b: "Xylem", c: "Pith", d: "Cortex", ans: "A", exp: "Phloem sieve tubes translocate photosynthates bi-directionally." },
  { q: "Heavy Water is chemically known as:", a: "Hydrogen Peroxide", b: "Deuterium Oxide", c: "Heavy Hydrogen", d: "Water Hydrate", ans: "B", exp: "Heavy water is D2O (Deuterium oxide), an isotope of hydrogen." },
  { q: "Which particle has mass approximately equal to proton?", a: "Electron", b: "Neutron", c: "Photon", d: "Positron", ans: "B", exp: "A neutron's mass (1.6749×10⁻²⁷ kg) is almost identical to a proton's." },
  { q: "Primary gas responsible for Global Warming:", a: "Oxygen", b: "Carbon Dioxide", c: "Nitrogen", d: "Helium", ans: "B", exp: "CO2 emitted from fossil combustion is the leading anthropogenic greenhouse gas." },
  { q: "Which instrument measures humidity in air?", a: "Hygrometer", b: "Hydrometer", c: "Barometer", d: "Pyrometer", ans: "A", exp: "A hygrometer calculates water vapor density in the atmosphere." },
  { q: "The phenomenon of dispersion of light is seen in:", a: "Lens", b: "Prism", c: "Plane Mirror", d: "Glass Slab", ans: "B", exp: "A triangular glass prism splits polychromatic white light into constituent spectral colors." },
  { q: "SI unit of thermodynamic temperature is:", a: "Celsius", b: "Kelvin", c: "Fahrenheit", d: "Rankine", ans: "B", exp: "Kelvin (K) is the absolute temperature SI base unit." },
  { q: "Which vitamin helps in blood coagulation?", a: "Vitamin A", b: "Vitamin K", c: "Vitamin E", d: "Vitamin B", ans: "B", exp: "Phylloquinone (Vitamin K) is needed for prothrombin synthesis in liver." },
  { q: "Atomic nucleus consists of:", a: "Electrons & Protons", b: "Protons & Neutrons", c: "Electrons & Neutrons", d: "Neutrons only", ans: "B", exp: "The dense atomic core contains nucleons: protons and neutrons." },
  { q: "Sound waves cannot travel through:", a: "Solids", b: "Liquids", c: "Vacuum", d: "Gases", ans: "C", exp: "Vacuum lacks particles to transmit compression and rarefaction waves." },
  { q: "Acid present in stomach for digestion is:", a: "Sulfuric Acid", b: "Hydrochloric Acid", c: "Nitric Acid", d: "Acetic Acid", ans: "B", exp: "Parietal gastric cells secrete hydrochloric acid (HCl, pH ~1.5–2)." },
  { q: "Main source of solar energy is:", a: "Nuclear Fission", b: "Nuclear Fusion", c: "Chemical Combustion", d: "Gravitational Pull", ans: "B", exp: "Proton-proton thermonuclear fusion converts hydrogen to helium in the Sun's core." },
  { q: "Chemical symbol for Sodium is:", a: "So", b: "Na", c: "K", d: "Sd", ans: "B", exp: "Na represents Natrium, the classical name for sodium." },
  { q: "Human brain largest part is:", a: "Cerebellum", b: "Cerebrum", c: "Medulla", d: "Pons", ans: "B", exp: "The cerebrum comprises roughly 85% of total brain mass." },
  { q: "Electric current is measured by:", a: "Voltmeter", b: "Ammeter", c: "Galvanometer", d: "Ohmmeter", ans: "B", exp: "An ammeter is connected in series in an electrical circuit." },
  { q: "Metal extracted from Bauxite ore is:", a: "Iron", b: "Aluminum", c: "Copper", d: "Zinc", ans: "B", exp: "Bauxite (Al2O3·2H2O) is the primary commercial ore for aluminum." },
  { q: "What type of lens is the human eye lens?", a: "Convex (Biconvex)", b: "Concave", c: "Flat", d: "Bifocal", ans: "A", exp: "The crystalline eye lens is a transparent flexible biconvex converging structure." },
  { q: "pH of acidic solution is always:", a: "Equal to 7", b: "Less than 7", c: "Greater than 7", d: "Zero", ans: "B", exp: "Acidic solutions have high H+ concentration with pH < 7." },
  { q: "Unit of luminous intensity is:", a: "Candela", b: "Lumen", c: "Watt", d: "Lux", ans: "A", exp: "Candela (cd) is the SI base unit of luminous intensity." },
  { q: "Disease caused by deficiency of Vitamin A:", a: "Scurvy", b: "Night Blindness", c: "Rickets", d: "Beriberi", ans: "B", exp: "Vitamin A is required to synthesize retinal pigment rhodopsin." },
  { q: "Galvanization is coating iron with:", a: "Copper", b: "Zinc", c: "Tin", d: "Chromium", ans: "B", exp: "Zinc protects underlying iron from rust through sacrificial anode action." },
  { q: "Rate of change of displacement is:", a: "Speed", b: "Velocity", c: "Acceleration", d: "Momentum", ans: "B", exp: "Velocity is the vector time rate of change of position." },
  { q: "Non-metal which conducts electricity:", a: "Diamond", b: "Graphite", c: "Sulfur", d: "Phosphorus", ans: "B", exp: "Graphite has sp2 hybridized carbon planes with delocalized pi electrons." },
  { q: "Structural and functional unit of kidney is:", a: "Neuron", b: "Nephron", c: "Alveoli", d: "Cell", ans: "B", exp: "Each human kidney contains roughly one million microscopic nephrons." },
  { q: "Gas used in LPG cylinders for odor detection:", a: "Ethyl Mercaptan", b: "Methane", c: "Propane", d: "Ethylene", ans: "A", exp: "Ethyl mercaptan (ethanethiol) is odorized into odorless LPG to alert leaks." },
  { q: "Unit of electric capacitance is:", a: "Farad", b: "Henry", c: "Tesla", d: "Weber", ans: "A", exp: "One Farad (F) equals one Coulomb of charge per Volt of potential." },
  { q: "Who discovered Penicillin?", a: "Louis Pasteur", b: "Alexander Fleming", c: "Robert Koch", d: "Edward Jenner", ans: "B", exp: "Alexander Fleming discovered penicillin from Penicillium notatum in 1928." },
  { q: "Boiling point of liquid with pressure increase:", a: "Decreases", b: "Increases", c: "Remains same", d: "First drops", ans: "B", exp: "Higher atmospheric pressure requires higher vapor pressure to boil, elevating temperature." },
  { q: "Filament of electric bulb is made of:", a: "Copper", b: "Tungsten", c: "Nichrome", d: "Iron", ans: "B", exp: "Tungsten has an ultra-high melting point (3422°C)." },
  { q: "Gas evolved when acid reacts with active metal:", a: "Oxygen", b: "Hydrogen", c: "Nitrogen", d: "Carbon Dioxide", ans: "B", exp: "Metal + Acid → Salt + Hydrogen gas (H2)." },
  { q: "Unit of magnetic flux density is:", a: "Tesla", b: "Weber", c: "Gauss", d: "Maxwell", ans: "A", exp: "Tesla (T) = 1 Weber per square meter (Wb/m²)." },
  { q: "Process of solid converting directly to gas is called:", a: "Evaporation", b: "Sublimation", c: "Condensation", d: "Melting", ans: "B", exp: "Sublimation occurs without transitioning through an intermediate liquid phase." },
  { q: "Chemical formula of Vinegar is:", a: "CH3COOH", b: "HCOOH", c: "HCl", d: "H2SO4", ans: "A", exp: "Vinegar is a 4–8% aqueous solution of acetic acid (ethanoic acid, CH3COOH)." },
  { q: "Normal human systolic blood pressure is approximately:", a: "80 mmHg", b: "120 mmHg", c: "140 mmHg", d: "100 mmHg", ans: "B", exp: "Healthy resting adult blood pressure is roughly 120/80 mmHg (systolic/diastolic)." },
  { q: "Ozone layer is present in which atmospheric layer?", a: "Troposphere", b: "Stratosphere", c: "Mesosphere", d: "Exosphere", ans: "B", exp: "The ozone protective layer is concentrated in the lower stratosphere." },
  { q: "Which color light bends most through a prism?", a: "Red", b: "Violet", c: "Green", d: "Yellow", ans: "B", exp: "Violet light has shorter wavelength and higher refractive index, bending most." },
  { q: "Unit of frequency (Hertz) is equal to:", a: "1 cycle/second", b: "1 meter/second", c: "1 joule/second", d: "1 watt/second", ans: "A", exp: "1 Hz = 1 periodic cycle per second (s⁻¹)." },
  { q: "Metal present in Chlorophyll is:", a: "Iron", b: "Magnesium", c: "Calcium", d: "Zinc", ans: "B", exp: "Magnesium ion (Mg²⁺) sits at the center of the porphyrin ring in chlorophyll." },
  { q: "First Law of Thermodynamics is a statement of:", a: "Conservation of Energy", b: "Conservation of Momentum", c: "Conservation of Mass", d: "Entropy Increase", ans: "A", exp: "Energy can neither be created nor destroyed; ΔU = Q - W." },
  { q: "Which organelle contains digestive hydrolytic enzymes?", a: "Ribosome", b: "Lysosome", c: "Vacuole", d: "Golgi Apparatus", ans: "B", exp: "Lysosomes contain acid hydrolases that degrade cellular waste." }
];

/**
 * Convert the 100 questions array into raw text in the exact bulk upload format:
 * "1. Question stem
 *  A. Option 1
 *  B. Option 2
 *  C. Option 3
 *  D. Option 4
 *  Ans: B
 *  Explanation: ..."
 */
export const getDemo100QuestionsRawText = (): string => {
  return DEMO_100_QUESTIONS.map((item, idx) => {
    const num = idx + 1;
    return `${num}. ${item.q}
A. ${item.a}
B. ${item.b}
C. ${item.c}
D. ${item.d}
Ans: ${item.ans}
${item.exp ? `Explanation: ${item.exp}\n` : ''}`;
  }).join('\n');
};

/**
 * Creates 100 Question objects for database
 */
export const createSample100Questions = (): Question[] => {
  return DEMO_100_QUESTIONS.map((item, idx) => ({
    id: `q_sample_${idx + 1}`,
    text: item.q,
    options: [
      { id: 'A', text: item.a },
      { id: 'B', text: item.b },
      { id: 'C', text: item.c },
      { id: 'D', text: item.d }
    ],
    correctOption: item.ans,
    explanation: item.exp || ''
  }));
};

/**
 * Create Full Offline Exam object ready for Firestore
 */
export const createSampleOfflineExam = (): Exam => {
  const questions = createSample100Questions();

  const baseExam: Exam = {
    id: 'offline_medical_model_01',
    courseId: 'general',
    courseName: 'Biology 1st Paper (Chapter-01)',
    title: 'Weekly Exam - 01',
    durationMinutes: 90,
    totalMarks: 100,
    totalQuestions: 100,
    passMark: 40,
    negativeMarkPercentage: 0.25,
    markPerQuestion: 1.0,
    isOffline: true,
    examType: 'offline',
    subject: 'General Knowledge & Science',
    instructions: '1. Use black ballpoint pen only. 2. Fill the bubbles completely. 3. Negative marking -0.25 for wrong answers.',
    startTime: 0,
    endTime: 0,
    resultPublishTime: 0,
    isActive: true,
    createdAt: Date.now() - 3600000,
    questions: questions
  };

  // Generate 10 deterministic shuffled sets (Set-01 to Set-10)
  const sets = generateBatchSets(baseExam, 10, 1);
  baseExam.offlineSets = sets;

  return baseExam;
};
