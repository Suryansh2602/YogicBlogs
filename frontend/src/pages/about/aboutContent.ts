// The About page text, from the owner's draft (2026-11-13), fact-checked: see docs/about-page.md. It names
// sources and describes practices; it never promises to cure or reverse an illness (Drugs and Magic Remedies
// Act), and never says "100%", "pure" or "chemical-free" (FSSAI claims rules).

export interface AboutText {
  eyebrow: string;
  title: string;
  lead: string;
  intro: string[];
  sourcesTitle: string;
  sourcesIntro: string;
  sources: { group: string; texts: string; teaches: string }[];
  doTitle: string;
  does: { title: string; text: string; link?: { to: string; label: string } }[];
  whyTitle: string;
  why: { title: string; text: string }[];
  whyClosing: string;
  whoTitle: string;
  who: string;
  labels: { tradeName: string; proprietor: string; place: string; gstin: string; fssai: string };
  place: string;
  proprietor: string;
  fssaiApplied: (ref: string) => string;
  contactTitle: string;
  contactText: string;
  whatsapp: string;
  call: string;
}

export const ABOUT_EN: AboutText = {
  eyebrow: 'About us',
  title: 'A path back to the wisdom of the classical texts',
  lead: 'Modern routines, and products full of synthetic additives, have pulled many of us out of balance. Healthmarg helps you return, step by step, to the daily and seasonal ways of living that India’s classical texts describe.',
  intro: [
    'Rushed days, fast food, stress, poor sleep and harsh everyday products have moved us away from the rhythms of nature. Many of us feel it as tiredness, low energy and falling ill often.',
    'We are on a mission to help you change those habits. We believe the answers to many problems of modern daily life lie in knowledge that India has tested and written down over thousands of years.',
  ],
  sourcesTitle: 'Where our guidance comes from',
  sourcesIntro:
    'We don’t make things up. Every routine, food and practice we suggest goes back to these texts, and our articles show the modern research beside each claim.',
  sources: [
    {
      group: 'Brihatrayi, the three great texts of Ayurveda',
      texts: 'Charaka Samhita, Sushruta Samhita and Ashtanga Hridaya',
      teaches: 'The foundations: how to stay healthy, what and how to eat, and how to care for body and mind.',
    },
    {
      group: 'Laghutrayi, the three lesser texts',
      texts: 'Madhava Nidana, Sharangadhara Samhita and Bhavaprakasha',
      teaches:
        'How illness is understood (Madhava Nidana), how Ayurvedic preparations are made (Sharangadhara Samhita), and the properties of herbs (the Nighantu of the Bhavaprakasha).',
    },
    {
      group: 'The yoga texts',
      texts: 'Patanjali’s Yoga Sutra and the Gheranda Samhita',
      teaches: 'The eight limbs of yoga for a steady, calm mind (Yoga Sutra), and a seven-limbed path of hatha yoga that begins with cleansing the body (Gheranda Samhita).',
    },
  ],
  doTitle: 'What we do',
  does: [
    {
      title: 'Daily and seasonal routines',
      text: 'Dinacharya (the daily routine) and ritucharya (the seasonal routine), as the Charaka and Sushruta Samhitas describe them, so that your routine changes with each season.',
      link: { to: '/ritucharya', label: 'Explore the six seasons' },
    },
    {
      title: 'Yoga and pranayama',
      text: 'Practices from the Yoga Sutra and the Gheranda Samhita, explained step by step so they fit into an ordinary day.',
    },
    {
      title: 'Fewer harsh products at home',
      text: 'Help to replace kitchen and bathroom products full of synthetic additives with simpler, traditional choices.',
    },
    {
      title: 'Products made the traditional way',
      text: 'Guided by the Bhavaprakasha and the Sharangadhara Samhita, we are preparing herbs, personal care and foods made by traditional methods, each with its full list of ingredients.',
    },
  ],
  whyTitle: 'Why connect with Healthmarg',
  why: [
    { title: 'A way of living, not just products', text: 'Everything we suggest is grounded in the classical texts.' },
    { title: 'Sources you can check', text: 'The text behind each piece of advice, with the modern research beside it.' },
    { title: 'For the whole family', text: 'Simple routines and fewer synthetic products, closer to nature.' },
    { title: 'A real person to talk to', text: 'Message or call Yogesh Upadhyay with your questions.' },
  ],
  whyClosing: 'Start with one change this season, and build a healthier, more energetic life from there.',
  whoTitle: 'Who we are',
  who: 'Healthmarg is run by Yogesh Upadhyay from Ambah, Morena, Madhya Pradesh. We are a registered business.',
  labels: { tradeName: 'Trade name', proprietor: 'Proprietor', place: 'Place', gstin: 'GSTIN', fssai: 'FSSAI' },
  place: 'Ambah, Morena, Madhya Pradesh',
  proprietor: 'Yogesh Upadhyay',
  fssaiApplied: (ref) => `Registration applied for (application ref. ${ref})`,
  contactTitle: 'Talk to us',
  contactText: 'Have a question about a routine, a season or a practice? Send us a message or call.',
  whatsapp: 'Chat on WhatsApp',
  call: 'Call',
};

export const ABOUT_HI: AboutText = {
  eyebrow: 'हमारे बारे में',
  title: 'शास्त्रों के ज्ञान की ओर लौटने का मार्ग',
  lead: 'आधुनिक दिनचर्या और कृत्रिम रसायनों (सिंथेटिक एडिटिव) से भरे उत्पादों ने हम में से कई लोगों का संतुलन बिगाड़ दिया है। हेल्थमार्ग आपको धीरे-धीरे उस दिनचर्या और ऋतुचर्या की ओर लौटने में मदद करता है, जिसका वर्णन भारत के प्राचीन शास्त्रों में है।',
  intro: [
    'भागदौड़ भरे दिन, फास्ट फूड, तनाव, खराब नींद और रोज़मर्रा के कठोर उत्पादों ने हमें प्रकृति की लय से दूर कर दिया है। इसका असर अक्सर थकान, कमज़ोरी और बार-बार बीमार पड़ने के रूप में दिखता है।',
    'हम इन आदतों को बदलने में आपकी मदद करने के मिशन पर हैं। हमारा मानना है कि आज की रोज़मर्रा की कई समस्याओं के उत्तर उस ज्ञान में हैं, जिसे भारत ने हज़ारों वर्षों में परखा और लिखा है।',
  ],
  sourcesTitle: 'हमारे ज्ञान के स्रोत',
  sourcesIntro: 'हम हवा में बातें नहीं करते। हमारी हर दिनचर्या, आहार और अभ्यास की सलाह इन ग्रंथों पर आधारित है, और हमारे लेखों में हर बात के साथ आधुनिक शोध भी दिया जाता है।',
  sources: [
    {
      group: 'बृहत्त्रयी: आयुर्वेद के तीन प्रमुख ग्रंथ',
      texts: 'चरक संहिता, सुश्रुत संहिता और अष्टांग हृदयम्',
      teaches: 'मूल सिद्धांत: स्वस्थ कैसे रहें, क्या और कैसे खाएँ, और शरीर व मन की देखभाल कैसे करें।',
    },
    {
      group: 'लघुत्रयी',
      texts: 'माधव निदान, शार्ङ्गधर संहिता और भावप्रकाश',
      teaches: 'रोग की पहचान (माधव निदान), आयुर्वेदिक औषधियाँ बनाने की विधि (शार्ङ्गधर संहिता), और जड़ी-बूटियों के गुण (भावप्रकाश का निघण्टु भाग)।',
    },
    {
      group: 'योग के ग्रंथ',
      texts: 'पतंजलि योग सूत्र और घेरण्ड संहिता',
      teaches: 'स्थिर और शांत मन के लिए योग के आठ अंग (योग सूत्र), और हठयोग का सात अंगों वाला मार्ग, जो शरीर की शुद्धि से शुरू होता है (घेरण्ड संहिता)।',
    },
  ],
  doTitle: 'हम क्या करते हैं',
  does: [
    {
      title: 'दिनचर्या और ऋतुचर्या',
      text: 'चरक और सुश्रुत संहिता में बताई गई दिनचर्या (रोज़ का क्रम) और ऋतुचर्या (मौसम के अनुसार क्रम), ताकि आपकी दिनचर्या हर ऋतु के साथ बदले।',
      link: { to: '/ritucharya?lang=hi', label: 'छह ऋतुएँ देखें' },
    },
    {
      title: 'योग और प्राणायाम',
      text: 'योग सूत्र और घेरण्ड संहिता के अभ्यास, चरण-दर-चरण समझाए गए, ताकि वे आपके साधारण दिन का हिस्सा बन सकें।',
    },
    {
      title: 'घर में कम कठोर उत्पाद',
      text: 'रसोई और बाथरूम के कृत्रिम रसायनों वाले उत्पादों की जगह सरल, पारंपरिक विकल्प अपनाने में आपका साथ।',
    },
    {
      title: 'पारंपरिक तरीके से बने उत्पाद',
      text: 'भावप्रकाश और शार्ङ्गधर संहिता से प्रेरित होकर हम पारंपरिक विधियों से बनी जड़ी-बूटियाँ, निजी देखभाल के उत्पाद और आहार तैयार कर रहे हैं। हर उत्पाद पर उसकी पूरी सामग्री लिखी होगी।',
    },
  ],
  whyTitle: 'हेल्थमार्ग से क्यों जुड़ें',
  why: [
    { title: 'केवल उत्पाद नहीं, एक जीवनशैली', text: 'हमारी हर सलाह शास्त्रों पर आधारित है।' },
    { title: 'स्रोत, जिन्हें आप जाँच सकें', text: 'हर सलाह के पीछे का ग्रंथ, और उसके साथ आधुनिक शोध।' },
    { title: 'पूरे परिवार के लिए', text: 'सरल दिनचर्या और कम कृत्रिम उत्पाद, प्रकृति के और करीब।' },
    { title: 'बात करने के लिए एक व्यक्ति', text: 'अपने प्रश्न योगेश उपाध्याय को संदेश भेजें या फ़ोन करें।' },
  ],
  whyClosing: 'इस ऋतु में एक बदलाव से शुरुआत करें, और वहीं से एक स्वस्थ और ऊर्जावान जीवन बनाएँ।',
  whoTitle: 'हम कौन हैं',
  who: 'हेल्थमार्ग का संचालन योगेश उपाध्याय अंबाह, मुरैना (मध्य प्रदेश) से करते हैं। हम एक पंजीकृत व्यवसाय हैं।',
  labels: { tradeName: 'व्यापारिक नाम', proprietor: 'स्वामी', place: 'स्थान', gstin: 'GSTIN', fssai: 'FSSAI' },
  place: 'अंबाह, मुरैना, मध्य प्रदेश',
  proprietor: 'योगेश उपाध्याय',
  fssaiApplied: (ref) => `पंजीकरण के लिए आवेदन किया गया है (आवेदन संदर्भ ${ref})`,
  contactTitle: 'हमसे बात करें',
  contactText: 'किसी दिनचर्या, ऋतु या अभ्यास के बारे में प्रश्न है? हमें संदेश भेजें या फ़ोन करें।',
  whatsapp: 'WhatsApp पर बात करें',
  call: 'फ़ोन करें',
};
