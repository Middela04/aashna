async function loadScreenPages(){
  const screenIds = [
    'screen-landing','screen-auth','screen-home','screen-checkin','screen-courses','screen-module','screen-lesson','screen-scenario',
    'screen-activities','screen-breathbox','screen-breath478','screen-prog-relax','screen-bodyscan','screen-senses',
    'screen-affirmations','screen-journal','screen-boundary-builder','screen-toolkit','screen-therapy-stigma',
    'screen-resources','screen-profile','screen-privacy','screen-terms','screen-support','screen-textline'
  ];
  const container = document.getElementById('screen-pages');
  if(!container) return;
  for(const id of screenIds){
    try {
      const res = await fetch('pages/' + id + '.html?v=20260710-10');
      if(!res.ok){ console.error('Failed to load', id, res.status); continue; }
      const html = await res.text();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      while(wrapper.firstChild){ container.appendChild(wrapper.firstChild); }
    } catch(err){ console.error('Error loading screen', id, err); }
  }
}

// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
const DEFAULT_THEME='mhisa';
const THEMES={
  'jaipur-morning':{label:'Jaipur Morning',note:'Warm sunrise sandstone',swatches:['#E88344','#F9DEC4','#2F7B69']},
  'kerala-monsoon':{label:'Kerala Monsoon',note:'Rain blues and backwater greens',swatches:['#6E8F95','#2F675A','#8B6B4C']},
  'lotus-sand':{label:'Lotus & Sand',note:'Soft pink and blush',swatches:['#D66F7E','#F9E4DF','#7B3F60']},
  'himalayan-sky':{label:'Himalayan Sky',note:'Cool blues and peaks',swatches:['#5D8FCD','#D8E8FB','#27496D']},
  'festival':{label:'Festival',note:'Violet nights and glow',swatches:['#8B3C8D','#F2B35A','#187D84']},
  'mhisa':{label:'MHISA',note:'Forest green, white, and blush',swatches:['#174A27','#FFFDF8','#F08E95']},
};
const AVATAR_OPTIONS=['🏔️','🪁','🌿','✨','☀️','🌙','☕','🧠'];

const S = {
  name:'',email:'',xp:0,sessionXp:0,streak:0,totalLessons:0,level:1,avi:'🌸',
  authenticated:false,
  moodDone:false,unlockAll:false,
  // lesson completion: 'modKey_lessonIdx' -> true
  done:{},
  // which activity screens have been visited this session
  activitiesDone:new Set(),
  // journal
  journal:[],
  // chat
  chat:[],chatBusy:false,
  // affirmations
  affIdx:0,affCat:'Identity',affLoved:new Set(),
  // breathing
  breathActive:{box:false,'478':false},breathTimers:{},breathCycles:{box:0,'478':0},
  // PMR
  prActive:false,prStep:0,prPhase:'tense',prTimer:null,prSec:0,prStarted:false,
  // Body Scan
  bsActive:false,bsStep:0,bsTimer:null,bsSec:0,bsStarted:false,
  // senses
  snsStep:0,snsDone:false,
  // settings
  settings:{notif:false,theme:DEFAULT_THEME},
  toolkit:{phrase:'',person:'',phrases:[],people:[]},
  appConfig:{googleEnabled:false,googleClientId:''},
  checkins:[],checkinDraft:{mood:'Okay',support:'calm'},
  // initial module progress
  modProgress:{bounds:3,bicul:1,family:0},
  // XP from initial progress
  initialised:false,
};
const KIT_EDIT={phrase:-1,person:-1};

function normalizeSettings(raw){
  const settings=raw && typeof raw==='object' ? raw : {};
  const storedTheme=localStorage.getItem('khushii_theme') || DEFAULT_THEME;
  return {
    notif:!!settings.notif,
    theme:THEMES[settings.theme] ? settings.theme : storedTheme
  };
}

function applyTheme(themeKey){
  const key=THEMES[themeKey] ? themeKey : DEFAULT_THEME;
  S.settings.theme=key;
  document.body.dataset.theme=key;
  localStorage.setItem('khushii_theme',key);
  document.querySelectorAll('.theme-option').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.theme===key);
  });
  updateHUD();
}

function setTheme(themeKey){
  if(!THEMES[themeKey] || S.settings.theme===themeKey)return;
  applyTheme(themeKey);
  saveProfileToServer();
  toast('Theme: '+THEMES[themeKey].label);
}

function renderThemePicker(){
  const grid=document.getElementById('theme-grid');
  if(!grid)return;
  grid.innerHTML=Object.entries(THEMES).map(([key,theme])=>
    `<button class="theme-option${S.settings.theme===key?' active':''}" data-theme="${key}" onclick="setTheme('${key}')">
      <div class="theme-swatch">${theme.swatches.map(color=>`<span style="background:${color}"></span>`).join('')}</div>
      <span class="theme-name">${theme.label}</span>
      <span class="theme-note">${theme.note}</span>
    </button>`
  ).join('');
}

function escapeHtml(str=''){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function normalizeToolkit(raw){
  const toolkit=raw && typeof raw==='object' ? raw : {};
  const phrases=Array.isArray(toolkit.phrases) ? toolkit.phrases.filter(Boolean).map(v=>String(v).trim()).filter(Boolean) : [];
  const people=Array.isArray(toolkit.people) ? toolkit.people.filter(Boolean).map(v=>String(v).trim()).filter(Boolean) : [];
  const legacyPhrase=typeof toolkit.phrase==='string' ? toolkit.phrase.trim() : '';
  const legacyPerson=typeof toolkit.person==='string' ? toolkit.person.trim() : '';
  if(legacyPhrase && !phrases.includes(legacyPhrase))phrases.unshift(legacyPhrase);
  if(legacyPerson && !people.includes(legacyPerson))people.unshift(legacyPerson);
  return {
    phrase:phrases[0] || '',
    person:people[0] || '',
    phrases,
    people
  };
}

// ══════════════════════════════════════
// DATA — AFFIRMATIONS
// ══════════════════════════════════════
const AFFS = [
  {t:'Being both is not a burden. It is a bridge.',cat:'Identity',ctx:'On biculturalism & belonging'},
  {t:'I can honor my roots while growing in my own direction.',cat:'Identity',ctx:'On belonging'},
  {t:'Two cultures live in me. Both are real. Both are mine.',cat:'Identity',ctx:'On duality'},
  {t:'I deserve to take up space in every world I belong to.',cat:'Identity',ctx:'On presence'},
  {t:'I am not a translation. I am an original.',cat:'Identity',ctx:'On wholeness'},
  {t:'My name, food, language, and story do not need softening.',cat:'Identity',ctx:'On pride'},
  {t:'I can be many things without being inconsistent.',cat:'Identity',ctx:'On complexity'},
  {t:'Belonging does not require shrinking the parts of me that are different.',cat:'Identity',ctx:'On self-trust'},

  {t:'I am allowed to set limits, even with people I love.',cat:'Boundaries',ctx:'On family & love'},
  {t:'A boundary is not rejection. It is a relationship with room to breathe.',cat:'Boundaries',ctx:'On sustainable connection'},
  {t:'My privacy is not disrespect.',cat:'Boundaries',ctx:'On digital and emotional space'},
  {t:'I can be kind and still say no.',cat:'Boundaries',ctx:'On warmth with firmness'},
  {t:'Someone else being disappointed does not mean I did something wrong.',cat:'Boundaries',ctx:'On guilt'},
  {t:'My time and energy are worthy of protection.',cat:'Boundaries',ctx:'On capacity'},
  {t:'I do not have to explain a boundary until it becomes negotiable.',cat:'Boundaries',ctx:'On clarity'},
  {t:'The people who love me can learn my limits.',cat:'Boundaries',ctx:'On trust'},

  {t:'I am not my family\'s fears. I am my own possibilities.',cat:'Family',ctx:'On breaking cycles'},
  {t:'I can be a loving child and live an authentic life.',cat:'Family',ctx:'On balance'},
  {t:'My love for my family does not require self-abandonment.',cat:'Family',ctx:'On devotion'},
  {t:'I can honor sacrifice without living only through debt.',cat:'Family',ctx:'On immigrant family pressure'},
  {t:'Comparison is not care. I am allowed to ask for support that sees me.',cat:'Family',ctx:'On being compared'},
  {t:'I can respect my elders and still trust my own inner knowing.',cat:'Family',ctx:'On autonomy'},
  {t:'My needs are not a betrayal of the people who raised me.',cat:'Family',ctx:'On having needs'},
  {t:'I can carry love forward without carrying every expectation.',cat:'Family',ctx:'On release'},

  {t:'My worth is not measured by my GPA, career, or relationship status.',cat:'Academic',ctx:'On self-worth'},
  {t:'Progress does not always look like productivity. Sometimes it looks like survival.',cat:'Academic',ctx:'On redefining success'},
  {t:'One grade is information, not identity.',cat:'Academic',ctx:'On setbacks'},
  {t:'Rest helps me learn. It is not the enemy of achievement.',cat:'Academic',ctx:'On burnout'},
  {t:'I can want excellence without making fear my fuel.',cat:'Academic',ctx:'On motivation'},
  {t:'My future is allowed to be bigger than other people\'s expectations.',cat:'Academic',ctx:'On choosing a path'},
  {t:'Asking for help is part of learning, not proof that I failed.',cat:'Academic',ctx:'On support'},
  {t:'A successful life should have space for my health.',cat:'Academic',ctx:'On sustainable ambition'},

  {t:'The grief I carry is real, even when others cannot see it.',cat:'Grief',ctx:'On invisible loss'},
  {t:'Distance does not make my love smaller.',cat:'Grief',ctx:'On diaspora grief'},
  {t:'I can mourn what changed, even if nobody died.',cat:'Grief',ctx:'On ambiguous loss'},
  {t:'My tears are not disrespect. They are love moving through me.',cat:'Grief',ctx:'On emotion'},
  {t:'I do not have to rush grief to make other people comfortable.',cat:'Grief',ctx:'On permission'},
  {t:'Ritual can be small and still be sacred.',cat:'Grief',ctx:'On remembrance'},
  {t:'Moving forward does not mean leaving love behind.',cat:'Grief',ctx:'On continuing bonds'},
  {t:'I can carry what mattered and set down what is too heavy.',cat:'Grief',ctx:'On healing'},

  {t:'My mental health is not a luxury. It is a necessity.',cat:'Self-Compassion',ctx:'On care'},
  {t:'Asking for help is not weakness. It is wisdom.',cat:'Self-Compassion',ctx:'On courage'},
  {t:'I do not have to earn my right to rest.',cat:'Self-Compassion',ctx:'On restoration'},
  {t:'The shame I carry is not mine to keep. I can set it down.',cat:'Self-Compassion',ctx:'On shame & release'},
  {t:'My healing does not have to look like anyone else\'s healing.',cat:'Self-Compassion',ctx:'On your own path'},
  {t:'I can hold myself accountable without being cruel to myself.',cat:'Self-Compassion',ctx:'On mistakes'},
  {t:'I am allowed to receive the care I so easily give.',cat:'Self-Compassion',ctx:'On receiving'},
  {t:'Being human is not a personal failure.',cat:'Self-Compassion',ctx:'On gentleness'},
];
const AFF_CATS = ['Identity','Boundaries','Family','Academic','Grief','Self-Compassion'];

// ══════════════════════════════════════
// DATA — SCENARIOS (all 10 unique)
// ══════════════════════════════════════
const SC = {
  s_b3:{mod:'bounds',lbl:'Lesson 3 · At Family Gatherings',spNm:'Your aunt',spRl:'at a festival gathering',spAv:'👩🏽‍🦱',
    pr:'"Beta, when are you getting married? You\'re not getting any younger! All your cousins are already settled — what are you waiting for?"',
    rs:[
      {em:'😅',tx:'Laugh awkwardly, say "haha yeah…" and change the subject.',type:'mid',xp:10,tt:'You deflected — and that\'s okay',ex:'Deflecting can be the right call in a crowded room. Over time, though, consistently brushing these questions aside can leave you feeling unseen. Your timeline is yours to own.'},
      {em:'🌿',tx:'"I\'m focused on my own priorities right now, Auntie — thanks for your concern though."',type:'good',xp:30,tt:'Warm AND firm — that\'s the skill',ex:'You acknowledged her care while redirecting with calm. You didn\'t shrink, you didn\'t explode. This is exactly what a maintained boundary looks like in a family context.'},
      {em:'😤',tx:'"Honestly, that\'s none of your business. Please stop asking me this."',type:'bad',xp:10,tt:'You stood your ground',ex:'You communicated clearly that this felt intrusive — that took courage. A slightly softer delivery can carry the exact same message with less fallout. Both things can be true: you deserve firm limits AND warm relationships.'},
    ]
  },
  s_b4:{mod:'bounds',lbl:'Lesson 4 · Digital Privacy',spNm:'Your parent',spRl:'holding your phone',spAv:'👩🏾',
    pr:'"I was checking your messages and saw your conversations with your friends. Some of it worried me. I think we should talk about what you\'re telling them."',
    rs:[
      {em:'😶',tx:'Feel mortified. Go to your room. Say nothing.',type:'mid',xp:10,tt:'You gave yourself space',ex:'Shutting down when overwhelmed is deeply human — especially when a private space has been entered without consent. Giving yourself time before responding can prevent words you\'d regret.'},
      {em:'🌿',tx:'"I understand you were worried, but I need my conversations to be private. I\'d feel safer coming to you directly when I need support."',type:'good',xp:30,tt:'Boundary plus invitation',ex:'You named your need AND opened another door. This is sophisticated communication — you\'re not just closing off, you\'re showing them a healthier path to connection.'},
      {em:'😡',tx:'Get angry and immediately put a new passcode on your phone.',type:'bad',xp:10,tt:'You protected your privacy',ex:'Protecting your privacy is completely valid. The reactive approach may escalate tension. A calmer conversation about trust — when things settle — builds something more lasting than a passcode.'},
    ]
  },
  s_b5:{mod:'bounds',lbl:'Lesson 5 · With a Romantic Partner',spNm:'Your partner',spRl:'during a difficult moment',spAv:'👤',
    pr:'"Why won\'t you just tell me what\'s going on? I feel like you\'re always shutting me out. If you really loved me, you\'d be completely open with me."',
    rs:[
      {em:'😔',tx:'Apologize immediately and share more than you\'re comfortable with.',type:'bad',xp:10,tt:'You prioritized the relationship — at a cost',ex:'Sharing to ease someone else\'s discomfort, when you\'re not ready, erodes your sense of self over time. Love doesn\'t require you to have no interior life.'},
      {em:'🌿',tx:'"I want to share with you, and I also need space to process things first. Both can be true."',type:'good',xp:30,tt:'Holding your need with kindness',ex:'This response does something powerful: it validates the relationship while also honoring your process. Intimacy doesn\'t mean every thought in real time. You\'re showing what healthy disclosure looks like.'},
      {em:'😤',tx:'Get defensive and say "You don\'t own my thoughts — back off."',type:'mid',xp:10,tt:'You defended your autonomy',ex:'You drew a clear line — and you had every right to. The defensive delivery might make it harder for your partner to hear what you most need them to understand. What if you named the same boundary with less heat?'},
    ]
  },
  s_b6:{mod:'bounds',lbl:'Lesson 6 · The Inner Boundary',spNm:'Your inner voice',spRl:'after a small mistake',spAv:'🧠',
    pr:'"I can\'t believe you said that — everyone probably judged you. You always do this. You\'re too much for people. You should just stay quiet next time."',
    rs:[
      {em:'😶',tx:'Agree with the thought and spiral into shame for the rest of the day.',type:'bad',xp:10,tt:'You believed the inner critic',ex:'Your inner critic often speaks in the voice of people who hurt you early on. Agreeing with it as if it\'s truth keeps the wound open. You have the right to question it.'},
      {em:'🌿',tx:'Pause and ask: "Is this actually true? Would I say this to a friend?"',type:'good',xp:30,tt:'The self-boundary: questioning your critic',ex:'This is the inner boundary — the line between you and the harsh voice. Asking "would I say this to someone I love?" interrupts the shame spiral. You deserve the same compassion you\'d give anyone else.'},
      {em:'💬',tx:'Text a friend and share what happened — get outside the loop in your head.',type:'mid',xp:20,tt:'You reached outward',ex:'Breaking the isolation of shame by connecting with someone safe is a genuinely healthy move. Connection and self-compassion can work together. Nice work.'},
    ]
  },
  s_bi2:{mod:'bicul',lbl:'Lesson 2 · The "Really From" Question',spNm:'A classmate',spRl:'at your new school',spAv:'👦🏼',
    pr:'"No but where are you REALLY from? Like originally. Your name sounds different. Are you Indian? What do you eat at home?"',
    rs:[
      {em:'😶',tx:'Give a short answer and end the conversation quickly.',type:'mid',xp:10,tt:'You chose your peace',ex:'Not every interaction deserves your full energy. This question can be exhausting after the hundredth time. Protecting your bandwidth is completely valid.'},
      {em:'🌿',tx:'"I\'m from here. My family has roots abroad — I\'m happy to share, though the \'really from\' framing can feel like it\'s saying I don\'t fully belong."',type:'good',xp:30,tt:'Educating while holding your ground',ex:'You answered AND gently corrected the framing. You opened the door to real connection while naming why it felt off. This invites the other person to grow — and protects your sense of belonging.'},
      {em:'🙄',tx:'"Wow, I\'ve never heard that one before." (sarcasm)',type:'mid',xp:10,tt:'You called it out',ex:'The sarcasm is understandable — this question IS exhausting. Your response communicated that clearly. If building genuine connection was also a goal, a different entry point might get you further.'},
    ]
  },
  s_bi3:{mod:'bicul',lbl:'Lesson 3 · Code-Switching',spNm:'Your parent',spRl:'overhearing you with friends',spAv:'👩🏾',
    pr:'"Why do you talk so differently with your friends? You sound like you\'re trying to be someone you\'re not. You used to speak properly."',
    rs:[
      {em:'😔',tx:'Feel ashamed and try to talk the same way with everyone.',type:'bad',xp:10,tt:'You collapsed your worlds',ex:'Code-switching is a normal, intelligent adaptation — not inauthenticity. Trying to erase it to please one context often leaves you feeling hollow in both. Your range is a strength.'},
      {em:'🌿',tx:'"I speak differently in different spaces — the way I talk to friends is also really me. Everyone code-switches; mine just crosses cultural lines."',type:'good',xp:30,tt:'Naming the skill with pride',ex:'This is one of the most undervalued bicultural skills: the ability to move fluidly between registers. You\'re not being fake — you\'re being fluent. This response claims that with dignity.'},
      {em:'🙄',tx:'Roll your eyes and walk away without explaining.',type:'mid',xp:10,tt:'You withdrew from the tension',ex:'Sometimes walking away is the healthiest move when you\'re not ready to explain. The question your parent raised often comes from fear of losing you to another world — knowing that might open a different conversation when the time feels right.'},
    ]
  },
  s_bi4:{mod:'bicul',lbl:'Lesson 4 · At Family Events',spNm:'Your uncle',spRl:'at a wedding reception',spAv:'👨🏽',
    pr:'"You\'ve become too American. You don\'t even come home for festivals anymore. You\'ve forgotten who you are. Your mother is very sad about this."',
    rs:[
      {em:'😔',tx:'Feel guilty and promise to come home more, even though you can\'t.',type:'bad',xp:10,tt:'You absorbed the guilt',ex:'Making promises from guilt rather than genuine capacity tends to lead to more resentment — on both sides. Your presence has value, and so does your honest communication about your limits.'},
      {em:'🌿',tx:'"I haven\'t forgotten who I am — I\'m still figuring out what that means across both worlds. I do miss being at festivals. Can we plan the next one together?"',type:'good',xp:30,tt:'Holding complexity with warmth',ex:'This response does three things: refutes the accusation, acknowledges your own longing, and offers a bridge. It shows your family that belonging to another world doesn\'t mean abandoning this one.'},
      {em:'😤',tx:'"You have no idea what my life looks like — please don\'t tell me who I am."',type:'mid',xp:10,tt:'You defended your identity',ex:'You drew a clear line about who gets to define you — and that\'s important. In a family setting, a slightly softer version carries the same message without creating a rift that\'s hard to repair.'},
    ]
  },
  s_bi5:{mod:'bicul',lbl:'Lesson 5 · Food & Identity',spNm:'A coworker',spRl:'in the office kitchen',spAv:'👦🏻',
    pr:'"What IS that? It smells really strong. Is that curry? Wow, do you eat that every day? I could honestly never."',
    rs:[
      {em:'😔',tx:'Feel embarrassed, put your lunch away, and eat something else.',type:'bad',xp:10,tt:'You erased yourself',ex:'Hiding your food to avoid someone else\'s discomfort teaches your nervous system that you\'re something to be ashamed of. Your food is part of your story — not a problem to be managed.'},
      {em:'🌿',tx:'"It\'s my family\'s recipe. Honestly it\'s delicious — want to try some?"',type:'good',xp:30,tt:'Unashamed and generous',ex:'Offering a taste disarms the awkwardness and reclaims the moment on your terms. You\'re not being defensive — you\'re being proudly yourself. This kind of small act is genuinely identity-building.'},
      {em:'😤',tx:'"I find that comment a bit rude honestly."',type:'mid',xp:15,tt:'You named the impact',ex:'Directly naming what landed as rude was honest and took courage. Most people genuinely don\'t realize how comments like this land. Whether they hear it or not, you didn\'t minimize your own experience. That matters.'},
    ]
  },
  s_f1:{mod:'family',lbl:'Lesson 1 · The Career Conversation',spNm:'Your parent',spRl:'at the dinner table',spAv:'👨🏾',
    pr:'"Beta, you need to be practical. Art won\'t give you stability — we didn\'t sacrifice everything for you to struggle. Your cousin Rohan just got into medical school. We just want what\'s best for you."',
    rs:[
      {em:'😔',tx:'Stay quiet and agree, even though it hurts.',type:'mid',xp:10,tt:'You kept the peace — for now',ex:'Unspoken disagreements tend to resurface, often bigger. Is there a calmer moment you could return to this conversation? Your silence isn\'t agreement — it\'s survival. And survival is valid.'},
      {em:'🌿',tx:'"I hear that you want security for me — I want that too. Can we talk about what a stable creative career actually looks like? I\'d love your support figuring that out together."',type:'good',xp:30,tt:'Bridging with empathy',ex:'You validated their core concern without abandoning your dream. Framing it as \'figure it out together\' invites them into your journey instead of positioning them as an obstacle. This is dialogue, not debate.'},
      {em:'😤',tx:'"Why do you always bring up Rohan? I\'m not him!"',type:'bad',xp:10,tt:'You named the comparison',ex:'Calling out comparison takes real courage. The heat might make it harder for your parent to hear what you most need them to hear, though. What if you named the same feeling with a little less activation?'},
    ]
  },
  s_f2:{mod:'family',lbl:'Lesson 2 · Being Compared',spNm:'Your parent',spRl:'after grades come out',spAv:'👩🏾',
    pr:'"Your cousin Priya got into Johns Hopkins. She always had that drive. We just wish you had that same focus. We\'re not asking for much — just to see you succeed."',
    rs:[
      {em:'😔',tx:'Feel like a failure. Apologize and promise to do better.',type:'bad',xp:10,tt:'You accepted the frame',ex:'Apologizing for not being someone else is a form of self-erasure. Your path, your pace, and your definition of success are all valid — even when they don\'t match Priya\'s.'},
      {em:'🌿',tx:'"I hear that you\'re proud of Priya, and I\'d love that kind of support for my own goals too. Comparing me to others makes it harder for me to feel seen."',type:'good',xp:30,tt:'Named the impact, asked for what you need',ex:'This response does both things: it names how comparison lands AND it tells them what would actually help. That\'s brave and clear. You\'re teaching them how to support you.'},
      {em:'😤',tx:'Say "I\'m tired of hearing about Priya" and leave the room.',type:'mid',xp:10,tt:'You removed yourself',ex:'Walking away from comparison that\'s hurting you is sometimes the right call. In the long run, one conversation about what you need from them — when things are calm — could change this pattern.'},
    ]
  },
  s_f3:{mod:'family',lbl:'Lesson 3 · The Inner Critic',spNm:'Your inner voice',spRl:'after a hard exam',spAv:'🧠',
    pr:'"You failed again. Everyone else seems to get this so easily. Maybe you\'re just not cut out for this. Your parents spent so much money and you\'re wasting it."',
    rs:[
      {em:'😶',tx:'Push the thought down and study harder without telling anyone.',type:'mid',xp:10,tt:'You pushed through — at a cost',ex:'White-knuckling through difficulty works until it doesn\'t. Isolation + shame is a reliable recipe for burnout. Even one trusted person knowing can change the weight of it entirely.'},
      {em:'🌿',tx:'Challenge the thought: "One test doesn\'t define my intelligence. What went wrong, and what\'s my plan?"',type:'good',xp:30,tt:'Cognitive reframing',ex:'You\'re not denying the difficulty — you\'re refusing to let one data point write your whole story. The exam is a skill test. Skills can be built. You\'re still in the process.'},
      {em:'💬',tx:'Reach out to someone you trust who understands this pressure.',type:'mid',xp:20,tt:'You reached out — that\'s strength',ex:'Sharing your struggle with someone who understands South Asian academic pressure can be genuinely grounding. You do not have to hold it alone.'},
    ]
  },
  s_f4:{mod:'family',lbl:'Lesson 4 · Hiding Your Struggles',spNm:'A trusted friend',spRl:'noticing something is off',spAv:'👩🏽',
    pr:'"Hey — I\'ve noticed you seem really burnt out lately. Are you actually okay? You can be honest with me."',
    rs:[
      {em:'😶',tx:'"I\'m fine, just tired. Everything\'s good."',type:'bad',xp:10,tt:'You hid behind "fine"',ex:'Many South Asians learned early that needs are burdens. "I\'m fine" is often survival language — not truth. The person in front of you is giving you a rare invitation. It doesn\'t have to be everything, but even a crack in the door changes things.'},
      {em:'🌿',tx:'"Honestly… not really. I\'ve been struggling more than I show. Thank you for noticing."',type:'good',xp:30,tt:'Vulnerable and real',ex:'This is one of the hardest things to do when you\'re wired to hold everything together. You let someone see you — and that is both an act of trust and an act of self-respect.'},
      {em:'🙂',tx:'"I\'ve been stressed about a few things. It\'s nothing I can\'t handle."',type:'mid',xp:15,tt:'A partial opening',ex:'You let a little in — that\'s progress. The qualifier "nothing I can\'t handle" is worth noticing. You might be able to handle it alone. That doesn\'t mean you have to.'},
    ]
  },
  s_f5:{mod:'family',lbl:'Lesson 5 · Having Needs',spNm:'Your parent',spRl:'when you request something for yourself',spAv:'👩🏽‍🦱',
    pr:'"You want to go on a trip with friends? But beta, we need you home for the puja next week. Family comes first. Your friends will understand — they have their own families."',
    rs:[
      {em:'😔',tx:'Cancel your plans without saying anything and feel resentful.',type:'bad',xp:10,tt:'You gave — and built resentment',ex:'Self-sacrifice that\'s silent and never discussed tends to accumulate into resentment. It also keeps your family from ever learning that you have needs that matter. Both of you lose.'},
      {em:'🌿',tx:'"I want to be there for the puja — can we figure out how I can do both? Or is there a version of this trip I can take a different weekend?"',type:'good',xp:30,tt:'Creative problem-solving from self-respect',ex:'You\'re not choosing yourself over your family — you\'re refusing to accept the premise that you must choose at all. This response looks for a third option, which is often the most empowered path.'},
      {em:'😤',tx:'Go on the trip anyway without telling them, to avoid the argument.',type:'mid',xp:10,tt:'You chose yourself — quietly',ex:'Going anyway protects your peace in the short term but creates a new layer of tension and secrecy. Can you imagine a version of this where you say clearly: "I\'m going, and I also love you"?'},
    ]
  },
  s_f6:{mod:'family',lbl:'Lesson 6 · Reparenting Yourself',spNm:'Your inner child',spRl:'needs something from you',spAv:'🧒🏽',
    pr:'"I just needed someone to tell me I was doing okay. That it was allowed to be hard. That I wasn\'t too much. Nobody said that. Can you say it now?"',
    rs:[
      {em:'😶',tx:'Feel uncomfortable and skip past it. That\'s not something you do.',type:'bad',xp:10,tt:'You dismissed the need',ex:'Many South Asians learned that emotional needs were inconvenient, dramatic, or selfish. Skipping past this moment is understandable — and also a continuation of that old message. You\'re allowed to need warmth.'},
      {em:'🌿',tx:'Take a breath and say to yourself: "You were doing your best. It was hard. You were not too much. I\'m proud of you."',type:'good',xp:30,tt:'Reparenting: the deepest boundary',ex:'This is inner work at its most profound. You\'re giving yourself something that was withheld. It might feel strange or even silly at first — but the nervous system doesn\'t know the difference between remembered warmth and real warmth. Do it anyway.'},
      {em:'💬',tx:'Write the words down in your journal — even if you can\'t say them yet.',type:'mid',xp:20,tt:'A gentler first step',ex:'Writing to yourself when speaking feels too raw is a real bridge. Your journal is a safe container for these words. Let yourself mean them slowly.'},
    ]
  },
  s_a2:{mod:'academic',lbl:'Lesson 2 · When a Grade Drops',spNm:'Your professor',spRl:'after an exam',spAv:'👩🏻‍🏫',
    pr:'"This exam was difficult for a lot of students. Your score is lower than usual, but it does not mean you cannot succeed in the class. What support would help before the next one?"',
    rs:[
      {em:'😶',tx:'Say you are fine, leave quickly, and decide to study twice as long alone.',type:'mid',xp:10,tt:'You protected your pride',ex:'Wanting to look composed is understandable. But isolation often makes academic stress louder. Support is not proof that you are failing — it is part of how learning works.'},
      {em:'🌿',tx:'"I feel embarrassed, but I do want to improve. Could we look at what I missed and make a plan for the next exam?"',type:'good',xp:30,tt:'You turned shame into strategy',ex:'This response names the feeling without letting it run the room. You shifted from "What does this say about me?" to "What can I do next?" That is the core academic resilience skill.'},
      {em:'😔',tx:'Decide this proves you are not smart enough for your major.',type:'bad',xp:10,tt:'You made one grade into an identity',ex:'A grade is feedback about one performance under one set of conditions. It is not a verdict on your intelligence, worth, or future. Your brain is allowed to need support and repetition.'},
    ]
  },
  s_a3:{mod:'academic',lbl:'Lesson 3 · The Family Call',spNm:'Your parent',spRl:'on FaceTime',spAv:'👨🏾',
    pr:'"How are classes? Are your grades still good? Remember, everyone back home is so proud of you. Do not lose focus now."',
    rs:[
      {em:'😶',tx:'Hide how stressed you are and say everything is perfect.',type:'bad',xp:10,tt:'You performed okayness',ex:'Many first-gen and diaspora students learn to protect family from worry by hiding struggle. The cost is that you carry the pressure alone. You deserve support before you reach a breaking point.'},
      {em:'🌿',tx:'"I am working hard, and I am also under a lot of stress. I do not need pressure right now as much as encouragement."',type:'good',xp:30,tt:'A clear request for emotional support',ex:'You did not reject their pride. You translated what would actually help. Sometimes families only know how to show care through pressure until someone teaches them another way.'},
      {em:'😤',tx:'"Can you stop asking about grades every time we talk?"',type:'mid',xp:10,tt:'You named the pattern',ex:'The boundary is valid. If you want the conversation to change, adding what you want instead can make it easier for them to meet you there: "Ask me how I am doing, not just how I am performing."'},
    ]
  },
  s_a4:{mod:'academic',lbl:'Lesson 4 · Comparing Paths',spNm:'A cousin',spRl:'at a family gathering',spAv:'👨🏽',
    pr:'"I heard you are not pre-med anymore. Are your parents okay with that? I mean, what are you going to do with that major?"',
    rs:[
      {em:'😔',tx:'Laugh it off and say you might switch back, even though you do not want to.',type:'bad',xp:10,tt:'You abandoned your clarity for comfort',ex:'It can feel safer to soften your choices so other people do not judge them. But your life needs your honesty more than it needs everyone\'s instant approval.'},
      {em:'🌿',tx:'"I am still figuring out the exact path, but this direction fits my strengths better. I am taking it seriously."',type:'good',xp:30,tt:'Grounded without over-explaining',ex:'You did not defend your entire future in one conversation. You communicated that your choice is thoughtful, not careless. That is often enough.'},
      {em:'😤',tx:'"Why does everyone act like medicine is the only respectable option?"',type:'mid',xp:15,tt:'You challenged a narrow definition of success',ex:'You named a real pressure in many South Asian families. The question may come out sharp, but the truth underneath matters: respectability should not require self-abandonment.'},
    ]
  },
  s_a5:{mod:'academic',lbl:'Lesson 5 · Burnout Warning Signs',spNm:'Your body',spRl:'late at night',spAv:'🫁',
    pr:'"Your chest feels tight, your eyes burn, and you have reread the same paragraph six times. You keep saying one more hour, but nothing is going in."',
    rs:[
      {em:'😔',tx:'Keep pushing because rest feels irresponsible.',type:'bad',xp:10,tt:'You confused depletion with discipline',ex:'Pushing past the point of learning is not dedication — it is nervous system overload. Rest is not the opposite of achievement. It is part of how your brain consolidates what you learn.'},
      {em:'🌿',tx:'Pause, drink water, set a 25-minute sleep or break timer, and decide the next smallest study step after that.',type:'good',xp:30,tt:'Recovery with structure',ex:'This is not giving up. It is regulating so your brain can come back online. Tiny next steps are often more effective than dramatic all-night promises.'},
      {em:'💬',tx:'Text a friend: "Can you remind me to stop in 20 minutes? I am spiraling."',type:'mid',xp:20,tt:'You let support interrupt the spiral',ex:'Borrowing someone else\'s steadiness is a smart strategy. Academic stress thrives in secrecy. A simple text can help you return to reality.'},
    ]
  },
  s_g2:{mod:'grief',lbl:'Lesson 2 · Grieving Far From Home',spNm:'Your family group chat',spRl:'after a death abroad',spAv:'📱',
    pr:'"The funeral is tomorrow in India. We know you have exams, so do not worry about coming. Just pray from there."',
    rs:[
      {em:'😶',tx:'Tell yourself it does not count as grief because you were not there.',type:'bad',xp:10,tt:'Distance does not cancel love',ex:'Diaspora grief can feel unreal because the rituals happen elsewhere. But your body still knows someone is gone. You are allowed to grieve even from far away.'},
      {em:'🌿',tx:'Light a candle, call someone who knew them, and make a small ritual where you are.',type:'good',xp:30,tt:'You created a bridge ritual',ex:'When you cannot be physically present, symbolic presence matters. Ritual gives grief a place to go. You are allowed to make one that fits your actual life.'},
      {em:'💬',tx:'Ask a relative to send one story about them instead of only logistics.',type:'mid',xp:20,tt:'You asked for connection',ex:'Stories help loss become real and tender rather than abstract. This is a meaningful way to participate when distance keeps you away.'},
    ]
  },
  s_g3:{mod:'grief',lbl:'Lesson 3 · When People Minimize It',spNm:'A relative',spRl:'after you seem sad',spAv:'👩🏽‍🦱',
    pr:'"Do not cry so much. Everyone has to go one day. Be strong. Your sadness will make the family more upset."',
    rs:[
      {em:'😶',tx:'Swallow the tears and focus on making everyone else comfortable.',type:'bad',xp:10,tt:'You hid your grief to protect others',ex:'This response may keep the room calm, but it leaves you alone with the pain. Your grief does not become harmful simply because someone else is uncomfortable seeing it.'},
      {em:'🌿',tx:'"I know everyone is hurting. Crying is how my body is processing this. I can be respectful and still feel it."',type:'good',xp:30,tt:'You made room for grief and dignity',ex:'You challenged the idea that strength means silence. This is a powerful reframe: emotion and respect can coexist.'},
      {em:'💬',tx:'Step away and voice-note a friend who can let you cry without fixing it.',type:'mid',xp:20,tt:'You found a safer witness',ex:'Not everyone can hold grief well. Finding one person who can witness without correcting you is protective and wise.'},
    ]
  },
  s_g5:{mod:'grief',lbl:'Lesson 5 · Ambiguous Loss',spNm:'Your old self',spRl:'during a quiet moment',spAv:'🪞',
    pr:'"I miss who I was before everything got so complicated. Before the move, the pressure, the distance, the pretending. Can you grieve me too?"',
    rs:[
      {em:'😔',tx:'Tell yourself this is dramatic because nobody died.',type:'bad',xp:10,tt:'You invalidated a real loss',ex:'Not all grief follows death. We can grieve versions of ourselves, homes, languages, ease, and futures we thought we would have. Naming that loss helps it soften.'},
      {em:'🌿',tx:'Write a goodbye note to that version of yourself and thank them for getting you here.',type:'good',xp:30,tt:'You honored the transition',ex:'This gives shape to a loss that is hard to explain. You are not rejecting your past self. You are acknowledging what they carried and letting them rest.'},
      {em:'💬',tx:'Share one sentence with someone safe: "I think I am grieving more than one thing."',type:'mid',xp:20,tt:'You made the invisible visible',ex:'Ambiguous grief becomes lighter when it has language. Even one sentence can make the experience less lonely.'},
    ]
  },
  s_s2:{mod:'selfcomp',lbl:'Lesson 2 · After a Mistake',spNm:'Your inner critic',spRl:'after sending the wrong message',spAv:'🧠',
    pr:'"You are so embarrassing. Why can everyone else be normal? You always mess things up."',
    rs:[
      {em:'😔',tx:'Replay it for hours and punish yourself by skipping rest.',type:'bad',xp:10,tt:'Shame became the consequence',ex:'Shame often pretends to be accountability, but it rarely helps you repair. You can learn from the mistake without turning yourself into the enemy.'},
      {em:'🌿',tx:'"That was awkward, not catastrophic. I can repair it if needed and still be kind to myself."',type:'good',xp:30,tt:'Self-compassion with accountability',ex:'This is the sweet spot: honest, grounded, and humane. You did not deny the mistake. You refused to make it your identity.'},
      {em:'💬',tx:'Ask a trusted friend, "Can you reality-check this with me?"',type:'mid',xp:20,tt:'You interrupted the shame loop',ex:'A safe outside perspective can help your nervous system recalibrate. Sometimes the brain needs a witness to remember proportion.'},
    ]
  },
  s_s3:{mod:'selfcomp',lbl:'Lesson 3 · Rest Without Earning It',spNm:'Your schedule',spRl:'on a Sunday afternoon',spAv:'📅',
    pr:'"You have free time, but there is always something productive you could do. Rest feels lazy when your family worked so hard."',
    rs:[
      {em:'😶',tx:'Fill the whole afternoon with tasks so you do not feel guilty.',type:'bad',xp:10,tt:'You obeyed guilt instead of your body',ex:'Productivity can become a way to outrun discomfort. But a life with no rest is not proof of gratitude. It is a path to burnout.'},
      {em:'🌿',tx:'Choose one hour of real rest and remind yourself: "My body does not need to earn care."',type:'good',xp:30,tt:'You practiced unconditional care',ex:'Rest is a basic nervous system need. When you let yourself rest before collapse, you are building trust with your body.'},
      {em:'📝',tx:'Make a small list of what is actually urgent and what can wait.',type:'mid',xp:20,tt:'You separated urgency from guilt',ex:'This is a practical bridge. Sometimes guilt says everything matters equally. A list helps you see what is real and what is pressure.'},
    ]
  },
  s_s5:{mod:'selfcomp',lbl:'Lesson 5 · Receiving Care',spNm:'A friend',spRl:'offering help',spAv:'👩🏽',
    pr:'"You have been doing so much for everyone. Can I bring you dinner tonight? You do not have to host me or explain anything."',
    rs:[
      {em:'😅',tx:'Say no automatically because accepting feels too needy.',type:'bad',xp:10,tt:'You blocked care before it reached you',ex:'If you were praised for being low-maintenance, receiving can feel vulnerable. But needing help is not a character flaw. It is part of being human.'},
      {em:'🌿',tx:'"That would actually help a lot. Thank you. I might be quiet, but I would love that."',type:'good',xp:30,tt:'You let care land',ex:'This is a self-compassion practice too: allowing someone else to show up for you without performing okayness in return.'},
      {em:'💬',tx:'Ask for a smaller version: "Could you just sit with me for a bit?"',type:'mid',xp:20,tt:'You adjusted the care to fit',ex:'Receiving does not have to mean accepting exactly what was offered. Naming the kind of support you can tolerate is still letting someone in.'},
    ]
  },
};

// ══════════════════════════════════════
// DATA — LESSON CONTENT (quiz/reflection)
// ══════════════════════════════════════
const LC = {
  bounds_l1:{type:'quiz',title:'What is a Boundary?',emoji:'🌿',xp:20,
    concept:'A boundary is a limit that defines where you end and someone else begins. In South Asian families, the concept of boundaries can feel taboo — we\'re taught that love means unlimited access. But love without limits isn\'t love; it\'s enmeshment.\n\nBoundaries aren\'t walls. They\'re guidelines that allow relationships to be sustainable. A boundary says: "I care about this relationship, AND I have a self that matters."',
    insight:'Having needs is not the same as being selfish. Boundaries protect both people in a relationship.',
    qs:[
      {q:'A boundary is best described as:',opts:['A wall that keeps people out','A limit that protects your wellbeing while allowing connection','A sign that you don\'t trust someone','A tool for punishing people who hurt you'],ans:1,fb:'Exactly. Boundaries aren\'t barriers to love — they\'re what makes love sustainable long-term.'},
      {q:'In South Asian family culture, why can boundaries feel especially difficult?',opts:['Because boundaries are selfish','Because family bonds are unimportant','Because love is often equated with unlimited access and sacrifice','Because South Asian families are distant'],ans:2,fb:'Yes — the cultural message "family first, self last" makes setting limits feel like betrayal. Understanding this context is the first step to changing it.'},
    ]
  },
  bounds_l2:{type:'quiz',title:'Types of Boundaries',emoji:'🛡️',xp:20,
    concept:'Boundaries exist across many dimensions of life:\n\n• Emotional: How much of your inner life you share, and with whom.\n• Physical: Your body, your space, your right to privacy.\n• Digital: Your phone, messages, and online life.\n• Time: How you spend your energy and who you give it to.\n• Financial: Your money and financial decisions.\n\nBoundaries can be soft (flexible, situational) or firm (non-negotiable). Most healthy relationships involve a mix.',
    insight:'Not all limits need to be the same strength. Some flex — others hold firm. Knowing the difference is wisdom.',
    qs:[
      {q:'Which of these is an example of a digital boundary?',opts:['Telling a friend you can\'t hang out today','Saying your parents cannot read your messages without asking','Choosing not to share your salary','Not hugging someone you don\'t know'],ans:1,fb:'Exactly. Your phone and digital communications are yours. Having expectations around access to them is healthy and normal.'},
      {q:'Emotional boundaries help you:',opts:['Avoid all conflict','Control other people\'s feelings','Choose what you share and with whom','Ensure everyone likes you'],ans:2,fb:'Yes — emotional boundaries aren\'t about emotional distance. They\'re about choosing who gets access to your interior life, and when.'},
    ]
  },
  bicul_l1:{type:'reflection',title:'What is Biculturalism?',emoji:'🌏',xp:20,
    concept:'Biculturalism means living meaningfully within two cultural frameworks simultaneously — navigating different sets of values, communication styles, food, language, expectations, and identity markers.\n\nFor South Asian diaspora, this often means being "Indian/Pakistani/Sri Lankan/Bangladeshi/etc. enough" at home and "American/British/Canadian enough" outside. Neither world is wrong. And yet, constantly translating yourself is exhausting.\n\nResearch shows bicultural individuals often develop exceptional empathy, adaptability, and perspective-taking. The tension you feel isn\'t a flaw — it\'s the cost of a profound skill.',
    insight:'You are not half of two things. You are the full sum of both. That is not less — it is more.',
    reflectQ:'When do you feel most yourself — at home, outside, both, or somewhere else? Take a moment to sit with that.',
  },
  bicul_l6:{type:'reflection',title:'Building Your Identity',emoji:'🌱',xp:25,
    concept:'Identity doesn\'t have to be chosen between cultures. The most resilient approach to biculturalism is an integrated identity — one that holds both as real, neither as performance.\n\nThis means: you don\'t have to prove your South Asian-ness to your family or your "Americanness" to your friends. You are the author of what those identities mean in your life.\n\nBuilding your identity is an ongoing project — not a destination. It asks you to notice which values from each culture you genuinely want to carry, and which you\'re carrying out of fear or habit.',
    insight:'You are not a translation. You are an original. Both cultures exist in you — the synthesis is entirely yours.',
    reflectQ:'What is one value from each of your cultures that you genuinely want to carry with you? What is one from either that you\'d like to release?',
  },
  family_l6:{type:'reflection',title:'Reparenting Yourself',emoji:'💛',xp:25,
    concept:'Reparenting is the process of giving yourself, as an adult, the emotional experiences you needed as a child but didn\'t receive — unconditional acceptance, reassurance, permission to have needs, freedom to fail.\n\nFor many South Asians, the messages received in childhood were conditional: love came through achievement, compliance, or invisibility. Reparenting doesn\'t mean blaming your family — it means recognizing the gaps, and consciously choosing to fill them yourself.\n\nThis is quiet, daily work: speaking to yourself with warmth, holding your own needs as legitimate, allowing yourself to feel without immediately managing it.',
    insight:'You can give yourself what was missing. It\'s not too late. It was never too late.',
    reflectQ:'What is one thing your childhood self needed to hear that nobody said? Can you say it to yourself now?',
  },
  academic_l1:{type:'quiz',title:'Pressure Is Not Motivation',emoji:'📚',xp:20,
    concept:`Academic pressure can look like motivation from the outside: high standards, packed schedules, constant striving. But pressure and motivation are not the same. Motivation moves you toward something meaningful. Pressure often moves you away from shame, disappointment, or fear.
For many South Asian students, school carries more than personal ambition. It can feel tied to immigration sacrifice, family reputation, financial stability, and the hope of making everyone proud. That weight is real. It also means your nervous system may treat every exam like a referendum on your worth.
A healthier academic relationship starts by separating performance from identity. You can care deeply about your future without making every grade a verdict on who you are.`,
    insight:'You are a person who is learning, not a transcript with a pulse.',
    qs:[
      {q:'What is the difference between motivation and pressure?',opts:['Motivation comes from meaning; pressure often comes from fear or shame','Pressure is always better because it creates success','Motivation means you never feel stressed','There is no difference'],ans:0,fb:'Yes. Motivation can include challenge, but it does not require your self-worth to be on trial.'},
      {q:'A healthier response to a disappointing grade is:',opts:['Assume you are not smart enough','Hide it from everyone forever','Use it as information and make a specific support plan','Punish yourself so it never happens again'],ans:2,fb:'Exactly. Grades can guide strategy. They do not get to define your identity.'},
    ]
  },
  academic_l6:{type:'reflection',title:'Your Definition of Success',emoji:'🧭',xp:25,
    concept:`Many South Asian families inherit a narrow map of success because safety mattered. Stable careers, prestige, and high achievement were not random values; they often came from real histories of scarcity, migration, racism, and sacrifice.
You can honor why that map existed without letting it be the only map you use. Your definition of success might include stability and ambition. It might also include rest, relationships, creativity, service, health, faith, joy, or freedom.
The goal is not to reject your family. The goal is to build a life that can actually hold you.`,
    insight:'A successful life that destroys you is not the only kind of success available.',
    reflectQ:'What did your family teach you success means? Which parts do you want to keep, and which parts do you want to rewrite?',
  },
  grief_l1:{type:'reflection',title:'Grief Has Many Shapes',emoji:'💔',xp:20,
    concept:`Grief is not only what happens after someone dies. It can also follow distance from home, losing a language, family estrangement, a breakup, a changed dream, a version of yourself you cannot return to, or a childhood that did not give you what you needed.

In many South Asian families, grief may be expressed through rituals, food, prayer, duty, silence, or practical caretaking. Some people cry openly. Others become busy. Some make jokes. Some go numb. None of these responses make your grief less real.

Healing starts by letting grief have a name. If something mattered, losing it matters too.`,
    insight:'Grief is love meeting change. If it hurts, it meant something.',
    reflectQ:'What loss in your life have you minimized because it did not look like a "real" loss?',
  },
  grief_l4:{type:'quiz',title:'Rituals and Continuing Bonds',emoji:'🕯️',xp:20,
    concept:`Ritual gives grief a place to go. A ritual does not have to be elaborate or perfectly traditional to matter. It can be lighting a diya or candle, making chai the way they liked it, reciting a prayer, cooking a family recipe, visiting water, wearing a color, playing a song, or telling one story out loud.

Psychologists sometimes call this a continuing bond: the relationship changes, but it does not vanish. You do not have to "move on" by forgetting. Often, healing means learning how to carry love differently.

For diaspora grief, personal rituals can be especially important because formal rituals may happen far away or in a language you only partly understand.`,
    insight:'You do not have to choose between tradition and your own way of mourning. A meaningful ritual can hold both.',
    qs:[
      {q:'A continuing bond means:',opts:['Refusing to accept that anything changed','Staying connected to what mattered while accepting the relationship has changed','Pretending grief is over after rituals end','Only mourning in the exact traditional way'],ans:1,fb:'Yes. Continuing bonds let love remain present without denying the reality of loss.'},
      {q:'A personal grief ritual is valid when:',opts:['It is approved by everyone','It helps give your grief a safe shape','It is expensive or public','It makes you stop feeling sad immediately'],ans:1,fb:'Exactly. Rituals do not erase grief. They help you hold it with care.'},
    ]
  },
  grief_l6:{type:'reflection',title:'Carrying Loss Forward',emoji:'🌊',xp:25,
    concept:`Grief rarely disappears all at once. It changes texture. Some days it is sharp; other days it becomes a quiet background ache. Anniversaries, songs, smells, holidays, and family events can bring it back unexpectedly.

Carrying loss forward means making room for grief without letting it be your only room. It asks: What did this person, place, dream, or version of me give me? What do I want to carry? What can I set down?

You are allowed to keep loving what is gone and still build a life here.`,
    insight:'Moving forward does not mean leaving love behind. Sometimes it means bringing love with you differently.',
    reflectQ:'What is one thing from your loss that you want to carry forward with tenderness? What is one weight you are ready to set down?',
  },
  selfcomp_l1:{type:'quiz',title:'What Self-Compassion Is Not',emoji:'🌱',xp:20,
    concept:`Self-compassion is often misunderstood as laziness, excuse-making, or lowering standards. It is none of those things. Self-compassion means responding to your pain or mistakes with honesty and care instead of contempt.

For high-achieving South Asian students, harshness can feel productive because it has been familiar for so long. But shame is an unstable fuel. It may push you temporarily, but it also teaches your body that you are unsafe with yourself.

Self-compassion has three parts: mindfulness ("this is hard"), common humanity ("I am not the only one who struggles"), and kindness ("I can respond with care").`,
    insight:'You can hold yourself accountable without being cruel to yourself.',
    qs:[
      {q:'Self-compassion means:',opts:['Letting yourself avoid all responsibility','Being honest about struggle while responding with care','Convincing yourself everything is fine','Waiting until you succeed to be kind to yourself'],ans:1,fb:'Yes. Self-compassion is not denial. It is a kinder way to stay present and responsible.'},
      {q:'Why can harsh self-talk feel productive?',opts:['Because shame is always healthy','Because it may be familiar and temporarily motivating','Because kind people never achieve anything','Because mistakes deserve punishment'],ans:1,fb:'Exactly. Familiar does not mean healthy. You can build motivation that does not depend on fear.'},
    ]
  },
  selfcomp_l4:{type:'reflection',title:'The Voice You Inherited',emoji:'🪞',xp:20,
    concept:`The way you speak to yourself did not come from nowhere. It may carry echoes of parents, teachers, relatives, religious spaces, school systems, or cultural expectations. Sometimes the inner critic is an old survival strategy: if you criticize yourself first, maybe nobody else can hurt you as much.

But inherited voices can be questioned. You can ask: Whose voice is this? What is it trying to protect me from? Is there a kinder voice that can still tell the truth?

You do not have to pass every old message down to yourself.`,
    insight:'Not every thought in your head deserves authority. Some are old recordings, not truth.',
    reflectQ:'What is one harsh phrase you often say to yourself? Whose voice does it sound like, and what would a kinder truthful version be?',
  },
  selfcomp_l6:{type:'reflection',title:'A Daily Practice',emoji:'✨',xp:25,
    concept:`Self-compassion becomes real through repetition, not one perfect breakthrough. It can be a hand on your chest before an exam. A softer sentence after a mistake. A real meal when you want to punish yourself. Asking for help before collapse. Letting yourself rest while the to-do list still exists.

Small practices matter because they retrain your nervous system. Each one says: I am allowed to be human here. I do not have to earn care by being impressive, useful, or easy.

The practice is not to love yourself perfectly. The practice is to return.`,
    insight:'Tiny acts of care become evidence. Over time, your body starts to believe you are on your own side.',
    reflectQ:'Choose one small self-compassion practice you can repeat this week. When and where will you try it?',
  },
};

// ══════════════════════════════════════
// DATA — MODULE STRUCTURE
// ══════════════════════════════════════
const MODS = {
  bounds:{color:'var(--sf)',title:'Maintaining Boundaries',cat:'family',icon:'🌿',bgc:'var(--sf-lt)',
    sub:'Learn to protect your energy and communicate needs — with warmth toward yourself and others.',
    lessons:[
      {label:'What is a Boundary?',type:'quiz',key:'bounds_l1',ltype:'📝 Quiz'},
      {label:'Types of Boundaries',type:'quiz',key:'bounds_l2',ltype:'📝 Quiz'},
      {label:'At Family Gatherings',type:'scenario',key:'s_b3',ltype:'🎭 Scenario'},
      {label:'Digital Privacy',type:'scenario',key:'s_b4',ltype:'🎭 Scenario'},
      {label:'With a Romantic Partner',type:'scenario',key:'s_b5',ltype:'🎭 Scenario'},
      {label:'The Inner Boundary',type:'scenario',key:'s_b6',ltype:'🎭 Scenario'},
    ]
  },
  bicul:{color:'var(--te)',title:'Biculturalism & Identity',cat:'identity',icon:'🌏',bgc:'var(--te-lt)',
    sub:'Navigate the beautiful tension of living between two worlds — and build a self that belongs in both.',
    lessons:[
      {label:'What is Biculturalism?',type:'reflection',key:'bicul_l1',ltype:'💭 Reflection'},
      {label:'The "Where Are You Really From?" Question',type:'scenario',key:'s_bi2',ltype:'🎭 Scenario'},
      {label:'Code-Switching',type:'scenario',key:'s_bi3',ltype:'🎭 Scenario'},
      {label:'At Family Events',type:'scenario',key:'s_bi4',ltype:'🎭 Scenario'},
      {label:'Food & Identity',type:'scenario',key:'s_bi5',ltype:'🎭 Scenario'},
      {label:'Building Your Identity',type:'reflection',key:'bicul_l6',ltype:'💭 Reflection'},
    ]
  },
  family:{color:'var(--pu)',title:'Family Expectations',cat:'family',icon:'👨‍👩‍👧',bgc:'var(--pu-lt)',
    sub:'Explore the weight of expectations — and learn to love your family while also honoring yourself.',
    lessons:[
      {label:'The Career Conversation',type:'scenario',key:'s_f1',ltype:'🎭 Scenario'},
      {label:'Being Compared',type:'scenario',key:'s_f2',ltype:'🎭 Scenario'},
      {label:'The Inner Critic',type:'scenario',key:'s_f3',ltype:'🎭 Scenario'},
      {label:'Hiding Your Struggles',type:'scenario',key:'s_f4',ltype:'🎭 Scenario'},
      {label:'Having Needs',type:'scenario',key:'s_f5',ltype:'🎭 Scenario'},
      {label:'Reparenting Yourself',type:'reflection',key:'family_l6',ltype:'💭 Reflection'},
    ]
  },
  academic:{color:'#4A6FA5',title:'Academic Stress',cat:'academic',icon:'📚',bgc:'#E6EEF8',
    sub:'Manage performance anxiety, perfectionism, and the weight of family academic expectations.',
    lessons:[
      {label:'Pressure Is Not Motivation',type:'quiz',key:'academic_l1',ltype:'📝 Quiz'},
      {label:'When a Grade Drops',type:'scenario',key:'s_a2',ltype:'🎭 Scenario'},
      {label:'The Family Call',type:'scenario',key:'s_a3',ltype:'🎭 Scenario'},
      {label:'Comparing Paths',type:'scenario',key:'s_a4',ltype:'🎭 Scenario'},
      {label:'Burnout Warning Signs',type:'scenario',key:'s_a5',ltype:'🎭 Scenario'},
      {label:'Your Definition of Success',type:'reflection',key:'academic_l6',ltype:'💭 Reflection'},
    ]
  },
  grief:{color:'var(--ro)',title:'Grief & Loss',cat:'care',icon:'💔',bgc:'var(--ro-lt)',
    sub:'Navigate loss within a culture that may have no language for it.',
    lessons:[
      {label:'Grief Has Many Shapes',type:'reflection',key:'grief_l1',ltype:'💭 Reflection'},
      {label:'Grieving Far From Home',type:'scenario',key:'s_g2',ltype:'🎭 Scenario'},
      {label:'When People Minimize It',type:'scenario',key:'s_g3',ltype:'🎭 Scenario'},
      {label:'Rituals and Continuing Bonds',type:'quiz',key:'grief_l4',ltype:'📝 Quiz'},
      {label:'Ambiguous Loss',type:'scenario',key:'s_g5',ltype:'🎭 Scenario'},
      {label:'Carrying Loss Forward',type:'reflection',key:'grief_l6',ltype:'💭 Reflection'},
    ]
  },
  selfcomp:{color:'var(--gn)',title:'Self-Compassion',cat:'care',icon:'🌱',bgc:'var(--gn-lt)',
    sub:'Cultivate the relationship with yourself that you\'ve been giving to everyone else.',
    lessons:[
      {label:'What Self-Compassion Is Not',type:'quiz',key:'selfcomp_l1',ltype:'📝 Quiz'},
      {label:'After a Mistake',type:'scenario',key:'s_s2',ltype:'🎭 Scenario'},
      {label:'Rest Without Earning It',type:'scenario',key:'s_s3',ltype:'🎭 Scenario'},
      {label:'The Voice You Inherited',type:'reflection',key:'selfcomp_l4',ltype:'💭 Reflection'},
      {label:'Receiving Care',type:'scenario',key:'s_s5',ltype:'🎭 Scenario'},
      {label:'A Daily Practice',type:'reflection',key:'selfcomp_l6',ltype:'💭 Reflection'},
    ]
  },
};

const BADGES = [
  {id:'first-day',ic:'🌱',nm:'First Day',cond:()=>S.totalLessons>=1},
  {id:'streak7',ic:'🔥',nm:'7-Day Streak',cond:()=>S.streak>=7},
  {id:'breathwork',ic:'🫁',nm:'Breathwork',cond:()=>S.activitiesDone.has('box')||S.activitiesDone.has('478')},
  {id:'grounded',ic:'🌿',nm:'Grounded',cond:()=>S.activitiesDone.has('senses')},
  {id:'journaler',ic:'📔',nm:'Journaler',cond:()=>S.journal.length>=3},
  {id:'affirm',ic:'✨',nm:'Affirmation',cond:()=>S.affLoved.size>=3},
  {id:'boundaries-done',ic:'🌺',nm:'Boundary Keeper',cond:()=>modDoneCount('bounds')>=6},
  {id:'bicul-done',ic:'🌍',nm:'Bridge Builder',cond:()=>modDoneCount('bicul')>=6},
  {id:'academic-done',ic:'📚',nm:'Pressure Tamer',cond:()=>modDoneCount('academic')>=6},
  {id:'grief-done',ic:'🕯️',nm:'Tender Witness',cond:()=>modDoneCount('grief')>=6},
  {id:'selfcomp-done',ic:'🌱',nm:'Self-Kindness',cond:()=>modDoneCount('selfcomp')>=6},
  {id:'level5',ic:'💎',nm:'Level 5',cond:()=>S.level>=5},
  {id:'journal10',ic:'🏆',nm:'Deep Diver',cond:()=>S.journal.length>=10},
  {id:'streak30',ic:'🌟',nm:'30-Day Streak',cond:()=>S.streak>=30},
];

function modDoneCount(k){return MODS[k].lessons.filter((_,i)=>S.done[k+'_'+i]).length;}

const COMM_POSTS = {
  desi:[
    {id:'d1',handle:'anon_desi_2004',avi:'🌸',bg:'var(--ro-lt)',time:'2h ago',comm:'Desi Daughters',cc:'var(--ro)',body:'Today I told my mom I wasn\'t okay and she actually listened. I used the boundary script from Lesson 3 and it genuinely worked. Small win but it meant everything 🌱',likes:84,comments:12},
    {id:'d2',handle:'quiet_storm_22',avi:'🌺',bg:'var(--ro-lt)',time:'6h ago',comm:'Desi Daughters',cc:'var(--ro)',body:'Can we talk about how exhausting it is to be the \'model\' everything? Model student, model daughter, model South Asian. I\'m tired of performing okayness 💙',likes:203,comments:47},
    {id:'d3',handle:'desi_and_healing',avi:'✨',bg:'var(--ro-lt)',time:'1d ago',comm:'Desi Daughters',cc:'var(--ro)',body:'Started therapy this week. My mom still thinks I go for "stress management" lol. Someday I\'ll have the words to explain it. For now, I\'m just glad I went.',likes:156,comments:38},
  ],
  premed:[
    {id:'p1',handle:'premed_anon_22',avi:'📚',bg:'var(--te-lt)',time:'5h ago',comm:'Pre-Med',cc:'var(--te)',body:'Failed my MCAT practice test. Parents don\'t know. If you\'re carrying something invisible right now — you\'re not alone 💙',likes:203,comments:47},
    {id:'p2',handle:'biochem_burnout',avi:'🧬',bg:'var(--te-lt)',time:'12h ago',comm:'Pre-Med',cc:'var(--te)',body:'Third year and still not sure medicine is what I want. But the thought of telling my parents makes me physically anxious. Anyone else feel trapped between their dream and their family\'s dream?',likes:318,comments:82},
    {id:'p3',handle:'aspiring_md_pivot',avi:'🌿',bg:'var(--te-lt)',time:'2d ago',comm:'Pre-Med',cc:'var(--te)',body:'I switched from pre-med to psychology. Parents didn\'t speak to me for 2 weeks. Hardest and most honest thing I\'ve ever done.',likes:421,comments:103},
  ],
  firstgen:[
    {id:'f1',handle:'first_gen_forever',avi:'🌍',bg:'var(--pu-lt)',time:'3h ago',comm:'First Gen',cc:'var(--pu)',body:'Nobody warned me that being first gen means being the family IT person, accountant, translator, AND top student simultaneously.',likes:287,comments:64},
    {id:'f2',handle:'carrying_the_dream',avi:'💫',bg:'var(--pu-lt)',time:'1d ago',comm:'First Gen',cc:'var(--pu)',body:'Sometimes I grieve the version of my parents that never got to follow their own dreams. Then I realize I\'m carrying their unlived life. That\'s too much weight for one person.',likes:502,comments:119},
  ],
  therapy:[
    {id:'t1',handle:'therapy_newcomer',avi:'🧘',bg:'var(--sf-lt)',time:'4h ago',comm:'Therapy Talk',cc:'var(--sf)',body:'Week 3 of therapy. My therapist asked what I\'d tell my childhood self and I just... completely broke down. This stuff is hard but it\'s real.',likes:144,comments:31},
    {id:'t2',handle:'culturally_competent',avi:'💚',bg:'var(--sf-lt)',time:'1d ago',comm:'Therapy Talk',cc:'var(--sf)',body:'Finding a therapist who actually understands South Asian family dynamics changed my whole experience. Specifically ask for culturally competent — it makes such a difference.',likes:298,comments:76},
  ],
};

// ══════════════════════════════════════
// PMR STEPS
// ══════════════════════════════════════
const PR_STEPS = [
  {ic:'🦶',part:'Feet & Toes',action:'Curl your toes tightly downward.',detail:'Squeeze as hard as feels comfortable. Feel the tension in the soles of your feet and your toes.',tense:6,release:10},
  {ic:'🦵',part:'Calves',action:'Flex your calf muscles hard.',detail:'Point your feet down and hold. Feel the muscles tighten up the back of your lower leg.',tense:6,release:10},
  {ic:'🧘',part:'Thighs',action:'Squeeze your thighs together firmly.',detail:'Press your knees together and clench both thighs. Notice where you feel the tension most.',tense:6,release:10},
  {ic:'🫁',part:'Stomach & Core',action:'Pull your stomach in tightly.',detail:'Suck in your belly, tighten your core. Hold. Notice the difference this makes to your breathing.',tense:6,release:12},
  {ic:'✋',part:'Hands & Forearms',action:'Make tight fists with both hands.',detail:'Squeeze hard. Feel the tension moving up your forearms. Knuckles pressing together.',tense:6,release:10},
  {ic:'💪',part:'Upper Arms & Shoulders',action:'Pull your shoulders up toward your ears.',detail:'Shrug hard, pull your arms tight to your sides. Feel tension across your upper back and neck.',tense:6,release:12},
  {ic:'😬',part:'Face & Jaw',action:'Scrunch your entire face tightly.',detail:'Squeeze your eyes, clench your jaw, furrow your brow. Hold it all at once. Notice the tension in your forehead.',tense:5,release:12},
  {ic:'🌿',part:'Whole Body Awareness',action:'Now feel the difference.',detail:'Breathe slowly. Notice the warmth and heaviness in your muscles. Let your whole body rest. You\'ve done the work.',tense:0,release:25},
];

// ══════════════════════════════════════
// BODY SCAN STEPS
// ══════════════════════════════════════
const BS_STEPS = [
  {ic:'🫁',area:'Breath Awareness',prompt:'Let your breath find its natural rhythm.',detail:'Don\'t try to change it — just notice it. The rise and fall of your chest. The temperature of the air. The small pause between inhale and exhale.',sec:22},
  {ic:'👑',area:'Top of Head',prompt:'Bring gentle awareness to the top of your head.',detail:'Notice any sensation — tingling, warmth, tightness, or nothing at all. Whatever is there is information. You don\'t need to change it.',sec:20},
  {ic:'😶',area:'Face & Jaw',prompt:'Let your face soften.',detail:'Notice your forehead, your brow, the muscles around your eyes. Are your teeth clenched? Let your jaw drop slightly. Let your tongue rest.',sec:22},
  {ic:'🫦',area:'Neck & Throat',prompt:'Bring awareness to your neck and throat.',detail:'This area often holds unexpressed emotion. Whatever you notice — tension, a lump, ease — just observe it without judgment. Breathe into it gently.',sec:22},
  {ic:'❤️',area:'Chest & Heart',prompt:'Rest your attention in your chest.',detail:'Notice the weight of your heart beating. Do you feel tightness, openness, grief, warmth? Let yourself feel it without needing to explain it.',sec:25},
  {ic:'🌀',area:'Belly & Gut',prompt:'Move down to your belly.',detail:'This is where anxiety often lives. Do you feel contraction here? Butterflies? Ease? Breathe into this space — let it expand on the inhale.',sec:22},
  {ic:'🦴',area:'Lower Back & Hips',prompt:'Bring awareness to your lower back and hips.',detail:'We carry a lot here — stress, grief, physical tension. Let the floor support you completely. Can you let go of any holding?',sec:22},
  {ic:'🦵',area:'Legs & Feet',prompt:'Scan down through your legs, calves, and feet.',detail:'Notice each section as you move through. Heaviness? Restlessness? The sensation of gravity? Let your legs be completely supported.',sec:25},
  {ic:'🌊',area:'Whole Body',prompt:'Now hold your whole body in awareness at once.',detail:'You don\'t have to do anything. Let yourself be exactly as you are — this weight, this breath, this moment. You are here. That is enough.',sec:30},
];

// ══════════════════════════════════════
// CHATBOT
// ══════════════════════════════════════
const BOT = [
  {p:/suicid|want to die|kill myself|end it all|not worth|harm myself|self.harm/i,crisis:true,t:"What you just shared matters deeply. Please reach out to the 988 Suicide & Crisis Lifeline — call or text 988, available 24/7. They have South Asian counselors available. You are not alone, and you deserve real support right now. Are you safe at this moment?"},
  {p:/panic|can't breathe|heart racing|spiraling|overwhelm/i,t:"That sounds like your nervous system is really activated right now. Let's slow things down. Try box breathing: IN for 4 counts, hold 4, OUT for 4, hold 4. The Box Breathing tool is right here in Activities. I'm with you."},
  {p:/anxious|anxiety|worried|so stressed|stress/i,t:"Anxiety is your nervous system trying to protect you — even when it's not helping. You're not broken for feeling this. Can you tell me more about what's going on? Sometimes just naming it shifts something."},
  {p:/family|parents|mom|dad|amma|papa|mother|father|expectation|pressure/i,t:"Family dynamics carry so much weight, especially in South Asian households. The gap between who your family wants you to be and who you know yourself to be can feel impossible to bridge. You're not alone in that. What's happening right now?"},
  {p:/school|grade|exam|fail|gpa|college|med school|mcat|study|academic/i,t:"Academic pressure in South Asian families can be genuinely crushing — the stakes feel personal AND familial all at once. Your grades are one part of you, not the whole story. What's coming up for you?"},
  {p:/lonely|alone|isolated|no one understands|nobody/i,t:"Feeling unseen — especially surrounded by people who don\'t fully understand your experience — is its own kind of pain. You deserve support that feels culturally safe and real. What does 'alone' feel like for you today?"},
  {p:/sad|cry|crying|depress|empty|numb|hopeless/i,t:"Thank you for trusting me with that. If these feelings have been around for a while, please consider speaking with a mental health professional. You deserve more than coping tools — you deserve real, sustained support. Have you been able to talk to anyone about this?"},
  {p:/angry|frustrated|rage|resentful|so mad/i,t:"Anger often signals that something important was crossed — a boundary, a value, a need. In many South Asian spaces, there\'s very little room for anger, especially from women. Your anger is valid information. What\'s underneath it for you?"},
  {p:/identity|who am i|belong|where do i fit|both worlds/i,t:"The bicultural identity question is one of the deepest there is. That friction is real. The Biculturalism & Identity module explores exactly this — but tell me more about where you are right now."},
  {p:/therapy|therapist|help|should i see/i,t:"Reaching out for therapy takes courage, especially when it\'s not normalized in your community. I\'d suggest looking for a culturally competent therapist — someone who understands South Asian family dynamics. Psychology Today lets you filter for this. Would that be helpful?"},
  {p:/thank|helped|feel better|good now/i,t:"I\'m really glad. This space is always here for you. Take care of yourself 🌿"},
  {p:/hi|hello|hey|start/i,t:"Hey, I\'m really glad you\'re here. I\'m a Khushii peer support guide, not a therapist, but I\'m here to listen with care. This is a safe space, and this conversation is private. What\'s on your mind today?"},
];

// ══════════════════════════════════════
// NAV
// ══════════════════════════════════════
const NAV_IDS = {
  'screen-home':'nv-home','screen-checkin':'nv-home','screen-courses':'nv-courses','screen-activities':'nv-activities',
  'screen-resources':'nv-resources','screen-profile':'nv-profile',
  'screen-privacy':'nv-profile','screen-terms':'nv-profile','screen-support':'nv-profile',
  'screen-module':'nv-courses','screen-lesson':'nv-courses','screen-scenario':'nv-courses',
  'screen-breathbox':'nv-activities','screen-breath478':'nv-activities','screen-prog-relax':'nv-activities',
  'screen-bodyscan':'nv-activities','screen-senses':'nv-activities','screen-affirmations':'nv-activities',
  'screen-journal':'nv-activities','screen-boundary-builder':'nv-activities','screen-toolkit':'nv-activities',
  'screen-therapy-stigma':'nv-activities','screen-textline':'nv-activities',
};
const NAV_SCREENS = new Set(['screen-home','screen-courses','screen-activities','screen-resources','screen-profile']);
const CURRENT_MOD = {key:null};
const NAV_HISTORY = [];
let CURRENT_SCREEN = null;

function go(id, opts={}){
  const {skipHistory=false} = opts;
  if(!skipHistory && CURRENT_SCREEN && CURRENT_SCREEN!==id){
    NAV_HISTORY.push(CURRENT_SCREEN);
  }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(id);
  if(!el)return;
  CURRENT_SCREEN=id;
  el.classList.add('active'); el.scrollTop=0;
  const show=id!=='screen-landing' && id!=='screen-auth';
  document.getElementById('status')?.classList.toggle('hidden',!show);
  document.getElementById('nav').classList.toggle('hidden',!show);
  document.getElementById('status-homeback')?.classList.toggle('hidden',!show||NAV_HISTORY.length===0);
  document.querySelectorAll('.nv').forEach(n=>n.classList.remove('active'));
  const nv=document.getElementById(NAV_IDS[id]||'');
  if(nv)nv.classList.add('active');
  if(id==='screen-courses')renderCourses();
  if(id==='screen-profile')renderProfile();
  if(id==='screen-affirmations')initAffs();
  if(id==='screen-senses')initSenses();
  if(id==='screen-journal')initJournal();
  if(id==='screen-boundary-builder')buildBoundaryScript();
  if(id==='screen-toolkit')initToolkit();
  if(id==='screen-textline')initChat();
  if(id==='screen-activities'){const el=document.getElementById('act-aff');if(el)el.textContent=AFFS[S.affIdx].t;}
  updateHUD();
}

function goBack(){
  while(NAV_HISTORY.length){
    const prev = NAV_HISTORY.pop();
    if(prev && prev!==CURRENT_SCREEN){
      go(prev,{skipHistory:true});
      return;
    }
  }
  if(CURRENT_SCREEN && CURRENT_SCREEN!=='screen-home'){
    go('screen-home',{skipHistory:true});
  }
}

function goMod(key){
  CURRENT_MOD.key=key;
  renderModule(key);
  go('screen-module');
}

async function loadProfileFromServer(){
  try {
    const res = await fetch('/api/profile');
    if(res.status===401){
      showAuthScreen();
      return;
    }
    if(!res.ok){
      console.warn('Profile load failed', res.status);
      showAuthScreen();
      return;
    }
    const data = await res.json();
    if(!data || !data.name){
      showAuthScreen();
      return;
    }

    S.email = data.email || S.email;
    S.name = data.name || S.name;
    S.authenticated = true;
    S.xp = data.xp ?? S.xp;
    S.streak = data.streak ?? S.streak;
    S.totalLessons = data.totalLessons ?? S.totalLessons;
    S.level = data.level ?? calcLevel(S.xp);
    S.avi = data.avi || S.avi;
    S.moodDone = data.moodDone ?? S.moodDone;
    S.unlockAll = data.unlockAll ?? S.unlockAll;
    S.done = data.done || S.done;
    S.journal = Array.isArray(data.journal) ? data.journal : S.journal;
    S.affIdx = data.affIdx ?? S.affIdx;
    S.affCat = data.affCat || S.affCat;
    S.affLoved = new Set(Array.isArray(data.affLoved) ? data.affLoved : []);
    S.activitiesDone = new Set(Array.isArray(data.activitiesDone) ? data.activitiesDone : []);
    S.settings = normalizeSettings(data.settings);
    S.toolkit = normalizeToolkit(data.toolkit);
    S.checkins = Array.isArray(data.checkins) ? data.checkins : S.checkins;
    S.modProgress = data.modProgress || S.modProgress;
    S.initialised = data.initialised ?? false;

    document.getElementById('home-gr').textContent = 'Hey, '+S.name+' ✨';
    document.getElementById('home-aff').textContent = AFFS[S.affIdx].t;
    document.getElementById('act-aff').textContent = AFFS[S.affIdx].t;
    const nameEl = document.getElementById('landing-name');
    if(nameEl) nameEl.value = S.name;
    const authEmailEl = document.getElementById('auth-email');
    if(authEmailEl) authEmailEl.value = S.email;
    const authNameEl = document.getElementById('auth-name');
    if(authNameEl && !authNameEl.value) authNameEl.value = S.name;
    renderThemePicker();
    applyTheme(S.settings.theme);
    checkBadges();
    if(S.initialised){
      routeAfterLogin();
    } else {
      go('screen-landing');
    }
  } catch(err){
    console.warn('Profile load failed', err);
    showAuthScreen();
  }
}

async function saveProfileToServer(){
  try {
    const payload = {
      name: S.name,
      email: S.email,
      xp: S.xp,
      streak: S.streak,
      totalLessons: S.totalLessons,
      level: S.level,
      avi: S.avi,
      moodDone: S.moodDone,
      unlockAll: S.unlockAll,
      done: S.done,
      journal: S.journal,
      affIdx: S.affIdx,
      affCat: S.affCat,
      affLoved: Array.from(S.affLoved),
      activitiesDone: Array.from(S.activitiesDone),
      settings: S.settings,
      toolkit: S.toolkit,
      checkins: S.checkins,
      modProgress: S.modProgress,
      initialised: S.initialised
    };
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if(res.status===401) showAuthScreen();
  } catch(err){
    console.warn('Profile save failed', err);
  }
}

function showAuthScreen(message='', isError=false){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-auth').classList.add('active');
  document.getElementById('status')?.classList.add('hidden');
  document.getElementById('nav').classList.add('hidden');
  const msg = document.getElementById('auth-msg');
  if(msg){
    msg.textContent=message;
    msg.style.color=isError? '#C03030':'#1A7A6B';
  }
}

function displayAuthMessage(message,isError=false){
  const msg=document.getElementById('auth-msg');
  if(msg){msg.textContent=message;msg.style.color=isError? '#C03030':'#1A7A6B';}
}

function displayLandingMessage(message,isError=false){
  const msg=document.getElementById('landing-msg');
  if(msg){msg.textContent=message;msg.style.color=isError? '#C03030':'#1A7A6B';}
}

async function loadAppConfig(){
  try{
    const res=await fetch('/api/config');
    if(!res.ok)return;
    const data=await res.json();
    S.appConfig={
      googleEnabled:!!data.googleEnabled,
      googleClientId:data.googleClientId || ''
    };
  } catch(err){
    console.warn('Config load failed', err);
  }
}

function updateGoogleAuthUI(){
  const wrap=document.getElementById('google-auth-wrap');
  const fallback=document.getElementById('google-auth-fallback');
  if(!fallback)return;
  if(S.appConfig.googleEnabled && window.google?.accounts?.id){
    if(wrap)wrap.style.display='block';
    fallback.style.display='none';
  } else {
    if(wrap)wrap.style.display='none';
    fallback.style.display='block';
    fallback.textContent=S.appConfig.googleEnabled ? 'Continue with Google' : 'Google sign-in unavailable';
    fallback.disabled=!S.appConfig.googleEnabled;
  }
}

function initGoogleAuth(){
  updateGoogleAuthUI();
  const target=document.getElementById('google-signin-button');
  if(!S.appConfig.googleEnabled || !target)return;
  if(!window.google?.accounts?.id){
    window.setTimeout(initGoogleAuth,500);
    return;
  }
  target.innerHTML='';
  updateGoogleAuthUI();
  window.google.accounts.id.initialize({
    client_id:S.appConfig.googleClientId,
    callback:handleGoogleCredentialResponse
  });
  window.google.accounts.id.renderButton(target,{
    theme:'outline',
    size:'large',
    text:'continue_with',
    shape:'pill',
    width:280
  });
}

async function loginEmail(){
  const email=document.getElementById('auth-email')?.value.trim() || '';
  const password=document.getElementById('auth-password')?.value || '';
  if(!email){displayAuthMessage('Enter an email',true);return;}
  if(!password){displayAuthMessage('Enter your password',true);return;}
  try {
    const res=await fetch('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok){displayAuthMessage(body.detail||body.error||'Login failed',true);return;}
    S.email=body.email || email.toLowerCase();
    S.authenticated=true;
    displayAuthMessage('Logged in successfully');
    await loadProfileFromServer();
  } catch(err){
    displayAuthMessage(err.message||'Login failed',true);
  }
}

async function registerEmail(){
  const email=document.getElementById('auth-email')?.value.trim() || '';
  const password=document.getElementById('auth-password')?.value || '';
  const name=document.getElementById('auth-name')?.value.trim() || '';
  if(!email){displayAuthMessage('Enter an email',true);return;}
  if(!password){displayAuthMessage('Create a password',true);return;}
  try {
    const res=await fetch('/api/register',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,name})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok){displayAuthMessage(body.detail||body.error||'Could not create account',true);return;}
    S.email=body.email || email.toLowerCase();
    S.name=body.name || name;
    S.authenticated=true;
    displayAuthMessage('Account created');
    await loadProfileFromServer();
  } catch(err){
    displayAuthMessage(err.message||'Could not create account',true);
  }
}

async function loginWithGoogle(){
  if(!S.appConfig.googleEnabled){
    displayAuthMessage('Google sign-in is not configured yet',true);
    return;
  }
  if(window.google?.accounts?.id){
    window.google.accounts.id.prompt();
    return;
  }
  displayAuthMessage('Google sign-in is loading. Try again in a moment.',true);
}

async function handleGoogleCredentialResponse(googleResponse){
  if(!googleResponse?.credential){
    displayAuthMessage('Google login failed',true);
    return;
  }
  try {
    const res=await fetch('/api/google-login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({credential:googleResponse.credential})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok){displayAuthMessage(body.detail||body.error||'Google login failed',true);return;}
    S.email=body.email || S.email;
    S.name=body.name || S.name;
    S.authenticated=true;
    displayAuthMessage('Signed in with Google');
    await loadProfileFromServer();
  } catch(err){
    displayAuthMessage('Google login failed',true);
  }
}

async function logout(){
  try {
    await fetch('/api/logout',{method:'GET'});
  } catch(e){}
  S.name=''; S.email=''; S.authenticated=false; S.initialised=false;
  showAuthScreen('Logged out');
}

// ══════════════════════════════════════
// INIT / START
// ══════════════════════════════════════
async function startApp(){
  const nameEl=document.getElementById('landing-name');
  const n=nameEl.value.trim();
  if(!S.authenticated){
    showAuthScreen('Log in to continue',true);
    return;
  }
  if(!n){nameEl.style.borderColor='var(--sf)';nameEl.focus();return;}
  S.name=n;
  if(!S.initialised){
    S.xp=0; S.streak=1; S.totalLessons=0; S.level=calcLevel(S.xp);
    S.done = S.done || {};
    S.initialised=true;
  }

  const visitKey = 'khushii_last_visit_' + (S.email||'guest');
  const streakKey = 'khushii_streak_' + (S.email||'guest');
  const today=new Date().toDateString();
  const lastVisit=localStorage.getItem(visitKey);
  const savedStreak=parseInt(localStorage.getItem(streakKey)||'0');
  if(!lastVisit){
    S.streak=1;
  } else {
    const last=new Date(lastVisit);
    const diff=Math.floor((new Date()-last)/(1000*60*60*24));
    if(diff===0) S.streak=savedStreak||1;
    else if(diff===1) S.streak=savedStreak+1;
    else S.streak=1;
  }
  localStorage.setItem(visitKey,today);
  localStorage.setItem(streakKey,S.streak);

  document.getElementById('home-gr').textContent='Hey, '+n+' ✨';
  document.getElementById('home-aff').textContent=AFFS[S.affIdx].t;
  document.getElementById('act-aff').textContent=AFFS[S.affIdx].t;
  checkBadges();
  displayLandingMessage('');
  go('screen-checkin');
  saveProfileToServer();
}

function calcLevel(xp){
  if(xp<100)return 1;
  if(xp<250)return 2;
  if(xp<500)return 3;
  if(xp<800)return 4;
  if(xp<1200)return 5;
  if(xp<1800)return 6;
  return 7;
}
function levelTitle(l){
  const t=['','Seeker 🌱','Learner 🌿','Explorer 🌏','Boundary Keeper 🛡️','Bridge Builder 🌉','Healer 💛','Wisdom Holder ✨'];
  return t[Math.min(l,7)]||'Wisdom Holder ✨';
}

function addXP(amt,isLesson=false){
  S.xp+=amt; S.sessionXp+=amt;
  if(isLesson) S.totalLessons++;
  S.level=calcLevel(S.xp);
  updateHUD();
  const stag=document.getElementById('session-xp-tag');if(stag)stag.textContent='+'+S.sessionXp+' XP';
  saveProfileToServer();
}

function updateHUD(){
  const sxp=document.getElementById('sxp');
  if(sxp){
    sxp.innerHTML=`<span class="status-xp-icon status-xp-icon-mhisa" aria-hidden="true"></span><span>${S.xp}</span>`;
  }
  const xpN=document.getElementById('xp-n');
  if(xpN)xpN.textContent=S.xp;
  const streakN=document.getElementById('streak-n');
  if(streakN)streakN.textContent=S.streak;
  const lvlN=document.getElementById('lvl-n');
  if(lvlN)lvlN.textContent=S.level;
}

function todayKey(){
  return new Date().toISOString().slice(0,10);
}

function routeAfterLogin(){
  const last=S.checkins[0]?.date;
  go(last===todayKey()?'screen-home':'screen-checkin');
}

function setCheckMood(btn,mood){
  S.checkinDraft.mood=mood;
  document.querySelectorAll('#check-moods button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

function setCheckSupport(btn,support){
  S.checkinDraft.support=support;
  document.querySelectorAll('#support-grid button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

function submitCheckIn(){
  const stress=parseInt(document.getElementById('check-stress')?.value || '5',10);
  const weight=(document.getElementById('check-weight')?.value || '').trim();
  const checkin={date:todayKey(),mood:S.checkinDraft.mood||'Okay',stress,weight,support:S.checkinDraft.support||'calm'};
  S.checkins=[checkin,...S.checkins.filter(c=>c.date!==checkin.date)].slice(0,30);
  if(!S.moodDone){addXP(10);S.moodDone=true;}
  saveProfileToServer();
  routeFromCheckIn(checkin);
}

function skipCheckIn(){
  S.checkins=[{date:todayKey(),mood:'Skipped',stress:0,weight:'',support:'skip'},...S.checkins.filter(c=>c.date!==todayKey())].slice(0,30);
  saveProfileToServer();
  go('screen-home');
}

function routeFromCheckIn(checkin){
  const text=(checkin.weight||'').toLowerCase();
  if(checkin.support==='calm' || checkin.stress>=8){
    toast('Recommended: calm your body first');
    go(checkin.stress>=8?'screen-breathbox':'screen-senses');
    return;
  }
  if(checkin.support==='vent'){
    toast('Recommended: talk it out');
    go('screen-textline');
    return;
  }
  if(checkin.support==='reflect'){
    toast('Recommended: journal this');
    go('screen-journal');
    return;
  }
  if(/family|parent|mom|dad|aunt|uncle|marriage/.test(text)){toast('Recommended: Family Expectations');goMod('family');return;}
  if(/school|exam|grade|gpa|career|college|study|burnout/.test(text)){toast('Recommended: Academic Stress');goMod('academic');return;}
  if(/identity|culture|belong|desi|brown|american|language/.test(text)){toast('Recommended: Biculturalism & Identity');goMod('bicul');return;}
  if(/grief|loss|miss|death|died|home/.test(text)){toast('Recommended: Grief & Loss');goMod('grief');return;}
  if(/shame|mistake|rest|worth|critic|self/.test(text)){toast('Recommended: Self-Compassion');goMod('selfcomp');return;}
  toast('Recommended: Maintaining Boundaries');
  goMod('bounds');
}

// ══════════════════════════════════════
// MOOD
// ══════════════════════════════════════
function selectMood(btn,emoji,label){
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  if(!S.moodDone){addXP(10);toast('Mood logged: '+emoji+' +10 XP');S.moodDone=true;saveProfileToServer();}
}

// ══════════════════════════════════════
// COURSES
// ══════════════════════════════════════
function renderCourses(cat='all'){
  const list=document.getElementById('mod-list');
  list.innerHTML='';
  Object.entries(MODS).forEach(([k,m])=>{
    if(cat!=='all'&&m.cat!==cat)return;
    const done=m.lessons.filter((_,i)=>S.done[k+'_'+i]).length;
    const tot=m.lessons.length||6;
    const pct=tot?Math.round(done/tot*100):0;
    const locked=m.locked&&!S.unlockAll;
    const el=document.createElement('div');
    el.className='mcard'+(locked?' locked':'');
    el.dataset.cat=m.cat;
    el.innerHTML=`<div class="mcard-ic" style="background:${m.bgc}">${m.icon}</div>
      <div class="mcard-info">
        <div class="mcard-title">${m.title}</div>
        <div class="mcard-meta">${done} of ${tot} lessons · ${m.cat}</div>
        <div class="bw"><div class="bf" style="width:${pct}%;background:${m.color}"></div></div>
      </div>
      <div class="mcard-r">
        <div style="font-size:11px;font-weight:900;color:var(--go)">${done*20} XP</div>
        <div style="font-size:13px">${locked?'🔒':renderStars(pct)}</div>
      </div>`;
    if(!locked) el.onclick=()=>goMod(k);
    list.appendChild(el);
  });
}

function filterMods(cat,btn){
  document.querySelectorAll('.ctab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderCourses(cat);
}

function renderStars(pct){
  const f=pct>=100?3:pct>=50?2:pct>0?1:0;
  const filled=Array.from({length:f},()=>'<span class="mhisa-inline-icon mhisa-inline-icon-xs" aria-hidden="true"></span>').join('');
  const empty=Array.from({length:3-f},()=>'<span class="mhisa-inline-icon mhisa-inline-icon-xs" style="opacity:.22" aria-hidden="true"></span>').join('');
  return filled+empty;
}

function renderModule(k){
  const m=MODS[k];
  if(!m)return;
  CURRENT_MOD.key=k;
  const hdr=document.getElementById('modhdr');
  hdr.style.background=m.color;
  document.getElementById('mhdr-title').textContent=m.title;
  document.getElementById('mhdr-sub').textContent=m.sub;
  document.getElementById('mhdr-pills').innerHTML=
    `<div class="pill">🎯 ${m.lessons.length} Lessons</div><div class="pill"><span class="mhisa-inline-icon mhisa-inline-icon-sm" aria-hidden="true"></span> ${m.lessons.length*20} XP</div><div class="pill">⏱ ~${m.lessons.length*4} min</div>`;
  const path=document.getElementById('lpath');
  path.innerHTML='';
  m.lessons.forEach((l,i)=>{
    if(i>0){const c=document.createElement('div');c.className='lconn';path.appendChild(c);}
    const node=document.createElement('div');node.className='lnode';
    const isDone=S.done[k+'_'+i];
    const isUnlocked=S.unlockAll||i===0||S.done[k+'_'+(i-1)];
    const isActive=isUnlocked&&!isDone;
    const circ=document.createElement('div');
    circ.className='lcirc '+(isDone?'l-done':isActive?'l-act':'l-lock');
    circ.textContent=isDone?'✓':isActive?m.icon:'🔒';
    if(isDone||isActive) circ.onclick=()=>launchLesson(k,i,l);
    const info=document.createElement('div');info.className='linfo';
    info.innerHTML=`<h4>${l.label}</h4><p>${isDone?'✓ Complete':isActive?'In progress':'Complete previous lesson'}</p><span class="ltype" style="color:${m.color}">${l.ltype}</span>`;
    node.appendChild(circ);node.appendChild(info);path.appendChild(node);
  });
  // CTA
  const nextIdx=m.lessons.findIndex((_,i)=>!S.done[k+'_'+i]&&(S.unlockAll||i===0||S.done[k+'_'+(i-1)]));
  const cta=document.getElementById('mod-cta');
  cta.style.background=m.color;
  if(nextIdx>=0) cta.textContent='Continue → Lesson '+(nextIdx+1);
  else cta.textContent='Module Complete ✓';
  cta.dataset.idx=nextIdx;
}

function launchActiveLesson(){
  const k=CURRENT_MOD.key; if(!k)return;
  const m=MODS[k];
  const idx=parseInt(document.getElementById('mod-cta').dataset.idx);
  if(idx<0)return;
  launchLesson(k,idx,m.lessons[idx]);
}

function launchLesson(modKey,lessonIdx,lesson){
  CURRENT_MOD.lessonIdx=lessonIdx;
  if(lesson.type==='scenario'){
    loadScenario(modKey,lessonIdx,lesson.key);
    go('screen-scenario');
  } else {
    loadLessonContent(modKey,lessonIdx,lesson);
    go('screen-lesson');
  }
}

// ══════════════════════════════════════
// LESSON CONTENT (quiz/reflection)
// ══════════════════════════════════════
let currentLessonState={modKey:null,lessonIdx:null,qIdx:0,qDone:false,qTotal:0};

function loadLessonContent(modKey,lessonIdx,lesson){
  const lc=LC[lesson.key];
  if(!lc){completeLessonDirect(modKey,lessonIdx);return;}
  currentLessonState={modKey,lessonIdx,qIdx:0,qDone:false,qTotal:lc.qs?lc.qs.length:0};
  document.getElementById('les-xp-badge').textContent='+'+lc.xp+' XP';
  document.getElementById('les-fill').style.width='5%';
  renderLessonStep(lc,0);
}

function renderLessonStep(lc,step){
  const body=document.getElementById('lesson-body');
  if(step===0){
    // Concept + insight
    const txt=lc.concept.replace(/\n/g,'<br><br>');
    body.innerHTML=`<div class="concept-card">
      <span class="concept-emoji">${lc.emoji}</span>
      <div class="concept-title">${lc.title}</div>
      <div class="concept-text">${txt}</div>
    </div>
    <div class="insight-card"><div class="insight-icon">💡</div><div class="insight-text">${lc.insight}</div></div>`;
    if(lc.type==='reflection'){
      body.innerHTML+=`<div class="q-label">Reflection</div>
        <div class="q-text">${lc.reflectQ}</div>
        <textarea class="reflect-area" id="reflect-ta" placeholder="Take a moment to write your thoughts… or simply sit with the question."></textarea>
        <button class="btn-sf" onclick="completeLessonDirect('${currentLessonState.modKey}',${currentLessonState.lessonIdx})">Complete Lesson ✓</button>`;
    } else {
      body.innerHTML+=`<button class="btn-sf" onclick="showQ(0)">Continue to Questions →</button>`;
    }
    document.getElementById('les-fill').style.width='30%';
  } else {
    // Quiz
    const q=lc.qs[step-1];
    const opts=q.opts.map((o,i)=>`<button class="q-opt" id="qo${i}" onclick="pickQ(${i},${q.ans},${step})">${o}</button>`).join('');
    body.innerHTML=`<div class="q-label">Question ${step} of ${lc.qs.length}</div>
      <div class="q-text">${q.q}</div>${opts}
      <div class="q-feedback" id="qfb"></div>`;
    document.getElementById('les-fill').style.width=Math.round((step/(lc.qs.length+1))*100)+'%';
  }
}

function showQ(idx){
  const lc=LC[MODS[currentLessonState.modKey].lessons[currentLessonState.lessonIdx].key];
  renderLessonStep(lc,idx+1);
}

function pickQ(chosen,correct,step){
  const lc=LC[MODS[currentLessonState.modKey].lessons[currentLessonState.lessonIdx].key];
  const q=lc.qs[step-1];
  const isCorrect=chosen===correct;
  const isLast=step>=lc.qs.length;
  const fb=document.getElementById('qfb');

  if(!isCorrect){
    const chosenEl=document.getElementById('qo'+chosen);
    if(chosenEl){
      chosenEl.classList.add('q-wrong');
      chosenEl.disabled=true;
    }
    for(let i=0;i<q.opts.length;i++){
      const el=document.getElementById('qo'+i);
      if(!el || i===chosen)continue;
      el.disabled=true;
      if(i===correct)el.classList.add('q-correct');
      else el.classList.add('q-dim');
    }
    if(fb){
      fb.innerHTML=`<div>Not quite. The better answer is: <strong>${q.opts[correct]}</strong></div><div style="margin-top:8px">${q.fb}</div>
        <button class="q-next" onclick="${isLast?`completeLessonDirect('${currentLessonState.modKey}',${currentLessonState.lessonIdx})`:`showQ(${step})`}">${isLast?'Continue →':'Try the next question →'}</button>`;
      fb.className='q-feedback show q-fb-bad';
    }
    return;
  }

  for(let i=0;i<q.opts.length;i++){
    const el=document.getElementById('qo'+i);
    if(!el)continue;
    el.disabled=true;
    if(i===correct)el.classList.add('q-correct');
    else el.classList.add('q-dim');
  }
  if(fb){
    fb.innerHTML=`<div>${q.fb}</div>
      <button class="q-next" onclick="${isLast?`completeLessonDirect('${currentLessonState.modKey}',${currentLessonState.lessonIdx})`:`showQ(${step})`}">${isLast?'Complete Lesson ✓':'Next Question →'}</button>`;
    fb.className='q-feedback show q-fb-good';
  }
}

function completeLessonDirect(modKey,lessonIdx){
  if(!S.done[modKey+'_'+lessonIdx]){
    S.done[modKey+'_'+lessonIdx]=true;
    const lc=LC[MODS[modKey].lessons[lessonIdx].key];
    const xp=(lc&&lc.xp)||20;
    addXP(xp,true);
    checkBadges();
    toast('✓ Lesson complete! +'+xp+' XP');
  }
  renderModule(modKey);
  go('screen-module');
}

// ══════════════════════════════════════
// SCENARIO
// ══════════════════════════════════════
let CUR_SC={modKey:null,lessonIdx:null,key:null};

function loadScenario(modKey,lessonIdx,scKey){
  CUR_SC={modKey,lessonIdx,key:scKey};
  const sc=SC[scKey];
  if(!sc)return;
  document.getElementById('slbl').textContent=sc.lbl;
  document.getElementById('sav').textContent=sc.spAv;
  document.getElementById('snm').textContent=sc.spNm;
  document.getElementById('srl').textContent=sc.spRl;
  document.getElementById('sprompt').textContent=sc.pr;
  document.getElementById('xfill').style.width='20%';
  document.getElementById('hearts').textContent='❤️❤️❤️';
  const con=document.getElementById('rcon');
  con.innerHTML=sc.rs.map((r,i)=>
    `<button class="ropt" id="ro${i}" onclick="pickR(${i})"><span class="rem">${r.em}</span><span>${r.tx}</span></button>`
  ).join('');
  document.getElementById('odrawer').classList.remove('open');
}

function pickR(idx){
  const sc=SC[CUR_SC.key];
  const r=sc.rs[idx];
  const el=document.getElementById('ro'+idx);
  el.classList.add(r.type==='good'?'r-good':r.type==='bad'?'r-bad':'r-mid');
  for(let i=0;i<sc.rs.length;i++){if(i!==idx){const e=document.getElementById('ro'+i);if(e)e.classList.add('r-dim');}}
  document.getElementById('xfill').style.width=r.type==='good'?'85%':'55%';
  document.getElementById('odic').textContent=r.type==='good'?'🌟':r.type==='bad'?'💫':'🤍';
  document.getElementById('odtt').textContent=r.tt;
  document.getElementById('odtx').textContent=r.ex;
  const xrow=document.getElementById('odxp');
  xrow.style.display=r.xp>=15?'flex':'none';
  document.getElementById('odxptx').textContent='+'+r.xp+' XP earned!';
  document.getElementById('odrawer').classList.add('open');
  if(!S.done[CUR_SC.modKey+'_'+CUR_SC.lessonIdx]){
    S.done[CUR_SC.modKey+'_'+CUR_SC.lessonIdx]=true;
    addXP(r.xp,true);
    checkBadges();
    saveProfileToServer();
  }
}

function closeOutcome(){
  document.getElementById('odrawer').classList.remove('open');
  setTimeout(()=>{renderModule(CUR_SC.modKey);go('screen-module');},320);
}

// ══════════════════════════════════════
// BREATHING
// ══════════════════════════════════════
const BPHASES={
  box:[{l:'Breathe In',s:4},{l:'Hold',s:4},{l:'Breathe Out',s:4},{l:'Hold',s:4}],
  '478':[{l:'Breathe In',s:4},{l:'Hold',s:7},{l:'Breathe Out',s:8}],
};

function toggleBreath(mode){S.breathActive[mode]?stopBreath(mode):startBreath(mode);}

function startBreath(mode){
  S.breathActive[mode]=true;
  S.breathCycles[mode]=0;
  const pfx=mode==='box'?'box':'478';
  document.getElementById('bbt-'+pfx).textContent='Stop';
  let pi=0,ct=BPHASES[mode][0].s;
  const up=()=>{
    const p=BPHASES[mode][pi];
    document.getElementById('bph-'+pfx).textContent=p.l;
    document.getElementById('bct-'+pfx).textContent=ct;
    applyBreathAnim(mode,pi,p.s);
  };
  up();
  S.breathTimers[mode]=setInterval(()=>{
    ct--;
    document.getElementById('bct-'+pfx).textContent=ct;
    if(ct<=0){
      pi=(pi+1)%BPHASES[mode].length;
      if(pi===0){
        S.breathCycles[mode]++;
        document.getElementById('bcyc-'+pfx).textContent='● '.repeat(Math.min(S.breathCycles[mode],5))+' cycle'+(S.breathCycles[mode]!==1?'s':'')+' complete';
        if(S.breathCycles[mode]===3){S.activitiesDone.add(mode==='box'?'box':'478');addXP(20);checkBadges();toast('🫁 3 cycles! +20 XP');}
      }
      ct=BPHASES[mode][pi].s; up();
    }
  },1000);
}

function stopBreath(mode){
  clearInterval(S.breathTimers[mode]);
  S.breathActive[mode]=false;
  const pfx=mode==='box'?'box':'478';
  const pe=document.getElementById('bph-'+pfx);if(pe)pe.textContent='Ready';
  const ce=document.getElementById('bct-'+pfx);if(ce)ce.textContent='\u00a0';
  const be=document.getElementById('bbt-'+pfx);if(be)be.textContent='Begin';
  resetBreathAnim(mode);
}

function applyBreathAnim(mode,pi,dur){
  if(mode==='box'){
    moveBoxBreathDot(pi,dur);
    return;
  }
  const pfx=mode==='box'?'box':'478';
  const expand=pi===0||pi===1;
  const ds=dur+'s ease-in-out';
  ['outer','mid','inner'].forEach(p=>{const e=document.getElementById('b'+p[0]+'-'+pfx);if(!e)return;e.style.transition=`transform ${ds}`;e.style.transform=expand?(p==='inner'?'scale(1.35)':'scale(1.12)'):(p==='inner'?'scale(0.65)':'scale(0.87)');if(p==='mid'){e.style.transition+=`,background ${ds}`;e.style.background=expand?'rgba(255,255,255,.14)':'rgba(255,255,255,.04)';}});
}

function resetBreathAnim(mode){
  if(mode==='box'){
    resetBoxBreathDot();
    return;
  }
  const pfx=mode==='box'?'box':'478';
  ['outer','mid','inner'].forEach(p=>{const e=document.getElementById('b'+p[0]+'-'+pfx);if(e){e.style.transform='';e.style.transition='';if(p==='mid')e.style.background='';}});
}

function moveBoxBreathDot(pi,dur){
  const dot=document.getElementById('box-dot');
  const vis=document.getElementById('box-vis');
  if(!dot)return;
  const edge=176;
  const coords=[
    [0,0],
    [edge,0],
    [edge,edge],
    [0,edge],
  ];
  const currentX=Number(dot.dataset.x ?? 0);
  const currentY=Number(dot.dataset.y ?? edge);
  const [targetX,targetY]=coords[pi];
  if(vis)vis.dataset.phase=String(pi);
  if(dot._boxAnim)dot._boxAnim.cancel();
  dot.style.transition='none';
  dot._boxAnim=dot.animate(
    [
      {transform:`translate(${currentX}px,${currentY}px)`},
      {transform:`translate(${targetX}px,${targetY}px)`},
    ],
    {duration:dur*1000,easing:'linear',fill:'forwards'}
  );
  dot._boxAnim.onfinish=()=>{
    dot.style.transform=`translate(${targetX}px,${targetY}px)`;
    dot.dataset.x=String(targetX);
    dot.dataset.y=String(targetY);
    dot._boxAnim=null;
  };
}

function resetBoxBreathDot(){
  const dot=document.getElementById('box-dot');
  const vis=document.getElementById('box-vis');
  if(vis)vis.dataset.phase='ready';
  if(!dot)return;
  if(dot._boxAnim)dot._boxAnim.cancel();
  dot.style.transition='none';
  dot.style.transform='translate(0,176px)';
  dot.dataset.x='0';
  dot.dataset.y='176';
  dot._boxAnim=null;
}

// ══════════════════════════════════════
// PROGRESSIVE RELAXATION
// ══════════════════════════════════════
S.prActive=false;S.prStep=0;S.prPhase='tense';S.prTimer=null;S.prSec=0;

function startPR(){
  document.getElementById('pr-start-btn').style.display='none';
  S.prActive=true;S.prStep=0;
  renderPRDots();
  runPRStep();
}

function renderPRDots(){
  document.getElementById('pr-dots').innerHTML=PR_STEPS.map((_,i)=>
    `<div class="pr-dot ${i<S.prStep?'done':i===S.prStep?'active':''}"></div>`
  ).join('');
}

function runPRStep(){
  const step=PR_STEPS[S.prStep];
  document.getElementById('pr-body-vis').textContent=step.ic;
  document.getElementById('pr-part').textContent=step.part;
  document.getElementById('pr-action').textContent=step.action;
  document.getElementById('pr-detail').textContent=step.detail;
  renderPRDots();
  if(step.tense>0){
    S.prPhase='tense'; S.prSec=step.tense;
    document.getElementById('pr-phase-tag').textContent='TENSE';
    runPRTimer(step.tense,()=>{S.prPhase='release';S.prSec=step.release;document.getElementById('pr-phase-tag').textContent='RELEASE';runPRTimer(step.release,()=>prAutoNext());});
  } else {
    S.prPhase=''; S.prSec=step.release;
    document.getElementById('pr-phase-tag').textContent='BREATHE';
    runPRTimer(step.release,()=>prAutoNext());
  }
}

function runPRTimer(secs,cb){
  const circ=document.getElementById('pr-circle');
  const totalDash=314;
  let rem=secs;
  document.getElementById('pr-timer').textContent=rem;
  circ.style.transition='none';
  circ.style.strokeDashoffset=totalDash;
  setTimeout(()=>{
    S.prTimer=setInterval(()=>{
      rem--;
      document.getElementById('pr-timer').textContent=rem;
      circ.style.transition=`stroke-dashoffset 0.9s linear`;
      circ.style.strokeDashoffset=totalDash-(((secs-rem)/secs)*totalDash);
      if(rem<=0){clearInterval(S.prTimer);cb();}
    },1000);
  },50);
}

function prAutoNext(){
  if(S.prStep>=PR_STEPS.length-1){
    prComplete();
  } else {
    S.prStep++;
    renderPRDots();
    runPRStep();
  }
}

function prNext(){
  clearInterval(S.prTimer);
  prAutoNext();
}

function prComplete(){
  S.activitiesDone.add('progrelax');
  addXP(25); checkBadges();
  document.getElementById('pr-body-vis').textContent='🌟';
  document.getElementById('pr-part').textContent='Complete';
  document.getElementById('pr-action').textContent='You\'ve completed Progressive Relaxation.';
  document.getElementById('pr-detail').textContent='Your muscles have been systematically tensed and released. Notice the warmth and heaviness — that\'s your body in a relaxed state. +25 XP earned!';
  document.getElementById('pr-timer').textContent='✓';
  document.getElementById('pr-phase-tag').textContent='';
  renderPRDots();
  document.getElementById('pr-next-btn').style.display='none';
  document.getElementById('pr-start-btn').style.display='block';
  document.getElementById('pr-start-btn').textContent='Back to Activities';
  document.getElementById('pr-start-btn').onclick=()=>go('screen-activities');
  toast('🤲 PMR complete! +25 XP');
}

function stopPR(){
  clearInterval(S.prTimer);
  S.prActive=false;
  const btn=document.getElementById('pr-start-btn');
  if(btn){btn.style.display='block';btn.textContent='Begin';btn.onclick=startPR;}
  document.getElementById('pr-next-btn').style.display='none';
}

// ══════════════════════════════════════
// BODY SCAN
// ══════════════════════════════════════
S.bsActive=false;S.bsStep=0;S.bsTimer=null;S.bsSec=0;

function startBS(){
  document.getElementById('bs-start-btn').style.display='none';
  document.getElementById('bs-next-btn').style.display='block';
  S.bsActive=true;S.bsStep=0;
  renderBSDots();
  runBSStep();
}

function renderBSDots(){
  document.getElementById('bs-dots').innerHTML=BS_STEPS.map((_,i)=>
    `<div class="bs-dot ${i<S.bsStep?'done':i===S.bsStep?'active':''}"></div>`
  ).join('');
}

function runBSStep(){
  const step=BS_STEPS[S.bsStep];
  document.getElementById('bs-part-ic').textContent=step.ic;
  document.getElementById('bs-area').textContent=step.area;
  document.getElementById('bs-prompt').textContent=step.prompt;
  document.getElementById('bs-detail').textContent=step.detail;
  renderBSDots();
  S.bsSec=step.sec;
  const circ=document.getElementById('bs-circle');
  const totalDash=289;
  let rem=step.sec;
  document.getElementById('bs-timer').textContent=rem;
  circ.style.transition='none';
  circ.style.strokeDashoffset=totalDash;
  setTimeout(()=>{
    S.bsTimer=setInterval(()=>{
      rem--;
      document.getElementById('bs-timer').textContent=rem;
      circ.style.transition='stroke-dashoffset 0.9s linear';
      circ.style.strokeDashoffset=totalDash-(((step.sec-rem)/step.sec)*totalDash);
      if(rem<=0){clearInterval(S.bsTimer);bsAutoNext();}
    },1000);
  },50);
}

function bsAutoNext(){
  if(S.bsStep>=BS_STEPS.length-1){bsComplete();}
  else{S.bsStep++;renderBSDots();runBSStep();}
}

function bsNext(){
  clearInterval(S.bsTimer);
  bsAutoNext();
}

function bsComplete(){
  S.activitiesDone.add('bodyscan');
  addXP(30); checkBadges();
  document.getElementById('bs-part-ic').textContent='🌊';
  document.getElementById('bs-area').textContent='Complete';
  document.getElementById('bs-prompt').textContent='Body Scan complete.';
  document.getElementById('bs-detail').textContent='You brought full awareness to your body without trying to change anything. That is a profound practice. +30 XP earned.';
  document.getElementById('bs-timer').textContent='✓';
  document.getElementById('bs-next-btn').style.display='none';
  document.getElementById('bs-start-btn').style.display='block';
  document.getElementById('bs-start-btn').textContent='Back to Activities';
  document.getElementById('bs-start-btn').onclick=()=>go('screen-activities');
  toast('🧘 Body Scan complete! +30 XP');
}

function stopBS(){
  clearInterval(S.bsTimer);
  S.bsActive=false;
  const btn=document.getElementById('bs-start-btn');
  if(btn){btn.style.display='block';btn.textContent='Begin';btn.onclick=startBS;}
  document.getElementById('bs-next-btn').style.display='none';
}

// ══════════════════════════════════════
// 5 SENSES
// ══════════════════════════════════════
const SNS=[
  {num:5,em:'👁️',sense:'Sight',q:'Name 5 things you can see.',hint:'Look around slowly. Colors, textures, shapes.',n:5},
  {num:4,em:'👂',sense:'Sound',q:'Name 4 things you can hear.',hint:'Even small sounds — breathing, traffic, silence.',n:4},
  {num:3,em:'🤲',sense:'Touch',q:'Name 3 things you can feel.',hint:'Surfaces, temperature, pressure on your body.',n:3},
  {num:2,em:'👃',sense:'Smell',q:'Name 2 things you can smell.',hint:'Breathe slowly. Even subtle scents count.',n:2},
  {num:1,em:'👅',sense:'Taste',q:'Name 1 thing you can taste.',hint:'Any lingering taste, or the sensation of your mouth.',n:1},
];

function initSenses(){
  S.snsStep=0;S.snsDone=false;
  document.getElementById('sns-done-view').style.display='none';
  document.getElementById('sns-step-view').style.display='flex';
  renderSNSDots();renderSNSStep();
}

function renderSNSDots(){
  document.getElementById('sns-prog').innerHTML=SNS.map((_,i)=>
    `<div class="sns-dot ${i<S.snsStep?'done':''}"></div>`
  ).join('');
}

function renderSNSStep(){
  const s=SNS[S.snsStep];
  const inputs=Array.from({length:s.n},(_,i)=>
    `<div class="sns-ir"><div class="sns-badge">${s.n-i}</div><input class="sns-in" id="sni${i}" placeholder="I can ${s.sense.toLowerCase()}…" autocomplete="off"></div>`
  ).join('');
  document.getElementById('sns-step-view').innerHTML=`
    <div class="sns-em">${s.em}</div>
    <div class="sns-num">${s.num} · ${s.sense}</div>
    <div class="sns-q">${s.q}</div>
    <div class="sns-hint">${s.hint}</div>
    <div class="sns-inputs">${inputs}</div>
    <button class="sns-nxt" onclick="nextSNS()">Continue →</button>`;
}

function nextSNS(){
  S.snsStep++;
  renderSNSDots();
  if(S.snsStep>=SNS.length){
    document.getElementById('sns-step-view').style.display='none';
    document.getElementById('sns-done-view').style.display='flex';
    S.activitiesDone.add('senses');
    addXP(25);checkBadges();
  } else {renderSNSStep();}
}

function resetSenses(){S.snsStep=0;}
function finishSenses(){resetSenses();go('screen-activities');}

// ══════════════════════════════════════
// AFFIRMATIONS
// ══════════════════════════════════════
function initAffs(){
  renderAffTabs();
  if(!getAffIndices().includes(S.affIdx)){
    const first=getAffIndices()[0];
    if(first!==undefined)S.affIdx=first;
  }
  renderAff();
}

function renderAff(){
  const a=AFFS[S.affIdx];
  if(!a)return;
  document.getElementById('aff-txt').textContent=a.t;
  document.getElementById('aff-ctx').textContent=a.ctx;
  const h=document.getElementById('aff-heart');
  h.textContent=S.affLoved.has(S.affIdx)?'❤️':'🤍';
  h.classList.toggle('loved',S.affLoved.has(S.affIdx));
  renderAffTabs();
  renderAffDots();
}

function getAffIndices(){
  return AFFS.map((a,i)=>a.cat===S.affCat?i:null).filter(i=>i!==null);
}

function renderAffTabs(){
  const tabs=document.getElementById('aff-tabs');
  if(!tabs)return;
  tabs.innerHTML=AFF_CATS.map(cat=>`<button class="aff-tab ${cat===S.affCat?'on':''}" onclick="selectAffCat('${cat}')">${cat}</button>`).join('');
}

function renderAffDots(){
  const dots=document.getElementById('aff-dots');
  if(!dots)return;
  const indices=getAffIndices();
  dots.innerHTML=indices.map((idx,i)=>`<button class="aff-d ${idx===S.affIdx?'on':''}" onclick="setAffByFilteredIndex(${i})" aria-label="Affirmation ${i+1}"></button>`).join('');
}

function selectAffCat(cat){
  S.affCat=cat;
  const indices=getAffIndices();
  S.affIdx=indices[0] ?? 0;
  renderAff();
  saveProfileToServer();
}

function setAffByFilteredIndex(i){
  const indices=getAffIndices();
  if(indices[i]===undefined)return;
  S.affIdx=indices[i];
  renderAff();
  saveProfileToServer();
}

function nextAff(){
  const indices=getAffIndices();
  const pos=indices.indexOf(S.affIdx);
  S.affIdx=indices[(pos+1+indices.length)%indices.length] ?? 0;
  renderAff();
  saveProfileToServer();
}
function prevAff(){
  const indices=getAffIndices();
  const pos=indices.indexOf(S.affIdx);
  S.affIdx=indices[(pos-1+indices.length)%indices.length] ?? 0;
  renderAff();
  saveProfileToServer();
}
function toggleHeart(){
  if(S.affLoved.has(S.affIdx)){S.affLoved.delete(S.affIdx);}
  else{S.affLoved.add(S.affIdx);addXP(5);toast('❤️ Saved +5 XP');}
  document.getElementById('aff-saved-n').textContent=S.affLoved.size;
  if(S.affLoved.size>=3){S.activitiesDone.add('affirm');checkBadges();}
  renderAff();
  saveProfileToServer();
}

// ══════════════════════════════════════
// JOURNAL
// ══════════════════════════════════════
function initJournal(){
  const now=new Date();
  document.getElementById('j-date').textContent=now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  ['jt1','jt2','jt3'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderJournal();
}

function saveJournal(){
  const t1=document.getElementById('jt1').value.trim();
  const t2=document.getElementById('jt2').value.trim();
  const t3=document.getElementById('jt3').value.trim();
  if(!t1&&!t2&&!t3){toast('Write something first 💙');return;}
  const now=new Date();
  S.journal.unshift({date:now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
    entries:[{p:'Grateful for:',t:t1},{p:'Challenge:',t:t2},{p:'Self-care today:',t:t3}].filter(e=>e.t)
  });
  ['jt1','jt2','jt3'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  addXP(15);
  if(S.journal.length>=3)S.activitiesDone.add('journal');
  checkBadges();
  toast('📔 Entry saved! +15 XP');
  renderJournal();
  saveProfileToServer();
}

function renderJournal(){
  const list=document.getElementById('j-list');
  if(!S.journal.length){list.innerHTML='<div style="text-align:center;padding:20px;color:var(--br-lt);font-size:13px;line-height:1.7">Your entries will appear here.<br>Writing even a few words matters. 🌱</div>';return;}
  list.innerHTML=S.journal.map(j=>`<div class="j-entry"><div class="j-e-date">${j.date}</div>${j.entries.map(e=>`<div class="j-e-prompt">${e.p}</div><div class="j-e-text">${e.t}</div>`).join('')}</div>`).join('');
}

// ══════════════════════════════════════
// PERSONAL TOOLS
// ══════════════════════════════════════
function buildBoundaryScript(){
  const person=document.getElementById('bb-person')?.value || 'parent';
  const topic=document.getElementById('bb-topic')?.value || 'privacy';
  const tone=document.getElementById('bb-tone')?.value || 'gentle';
  const people={parent:'I know this comes from care',relative:'I know you mean well',partner:'I care about us',friend:'I value our friendship',inner:'I hear that you are trying to protect me'};
  const topics={privacy:'I need my private conversations and personal space to be respected',time:'I cannot be available every time I am asked',career:'I need room to make thoughtful choices about my future',marriage:'I am not discussing my dating or marriage timeline right now',emotion:'I need time to process before I talk more about this'};
  const endings={gentle:'Can we try that moving forward?',firm:'This is what I need in order to stay connected without resentment.',direct:'Please respect this boundary.'};
  const script=`${people[person]}, and ${topics[topic]}. ${endings[tone]}`;
  const out=document.getElementById('bb-output');
  if(out)out.textContent=script;
  return script;
}

function copyBoundaryScript(){
  const script=buildBoundaryScript();
  if(navigator.clipboard)navigator.clipboard.writeText(script);
  S.activitiesDone.add('boundary-builder');
  toast('Boundary script copied');
  saveProfileToServer();
}

function initToolkit(){
  S.toolkit=normalizeToolkit(S.toolkit);
  KIT_EDIT.phrase=-1;
  KIT_EDIT.person=-1;
  const phrase=document.getElementById('kit-phrase');
  const person=document.getElementById('kit-person');
  if(phrase)phrase.value='';
  if(person)person.value='';
  updateToolkitButtons();
  renderToolkitItems();
  renderToolkitSummary();
}

function updateToolkitButtons(){
  const phraseBtn=document.getElementById('kit-phrase-btn');
  const personBtn=document.getElementById('kit-person-btn');
  if(phraseBtn)phraseBtn.textContent=KIT_EDIT.phrase>=0?'Update Phrase':'Save Phrase';
  if(personBtn)personBtn.textContent=KIT_EDIT.person>=0?'Update Support':'Save Support';
}

function syncToolkitLegacyFields(){
  S.toolkit.phrase=S.toolkit.phrases[0] || '';
  S.toolkit.person=S.toolkit.people[0] || '';
}

function saveToolkitPhrase(){
  const input=document.getElementById('kit-phrase');
  const value=input?.value.trim() || '';
  if(!value){toast('Add a phrase first');return;}
  S.toolkit=normalizeToolkit(S.toolkit);
  if(KIT_EDIT.phrase>=0)S.toolkit.phrases[KIT_EDIT.phrase]=value;
  else S.toolkit.phrases.unshift(value);
  S.toolkit.phrases=[...new Set(S.toolkit.phrases)];
  KIT_EDIT.phrase=-1;
  if(input)input.value='';
  finishToolkitSave('Phrase saved');
}

function saveToolkitPerson(){
  const input=document.getElementById('kit-person');
  const value=input?.value.trim() || '';
  if(!value){toast('Add a support first');return;}
  S.toolkit=normalizeToolkit(S.toolkit);
  if(KIT_EDIT.person>=0)S.toolkit.people[KIT_EDIT.person]=value;
  else S.toolkit.people.unshift(value);
  S.toolkit.people=[...new Set(S.toolkit.people)];
  KIT_EDIT.person=-1;
  if(input)input.value='';
  finishToolkitSave('Support saved');
}

function clearToolkitInputs(){
  const phrase=document.getElementById('kit-phrase');
  const person=document.getElementById('kit-person');
  if(phrase)phrase.value='';
  if(person)person.value='';
  KIT_EDIT.phrase=-1;
  KIT_EDIT.person=-1;
  updateToolkitButtons();
}

function finishToolkitSave(message){
  syncToolkitLegacyFields();
  S.activitiesDone.add('toolkit');
  updateToolkitButtons();
  renderToolkitItems();
  renderToolkitSummary();
  toast(message);
  saveProfileToServer();
}

function renderToolkitItems(){
  const el=document.getElementById('kit-items');
  if(!el)return;
  S.toolkit=normalizeToolkit(S.toolkit);
  const phraseItems=S.toolkit.phrases.map((phrase,i)=>`
    <div class="kit-item">
      <div class="kit-item-top">
        <span class="kit-tag">Phrase</span>
      </div>
      <div class="kit-item-text">${escapeHtml(phrase)}</div>
      <div class="kit-actions">
        <button class="kit-action" onclick="editToolkitPhrase(${i})">Edit</button>
        <button class="kit-action danger" onclick="deleteToolkitPhrase(${i})">Remove</button>
      </div>
    </div>`).join('');
  const personItems=S.toolkit.people.map((person,i)=>`
    <div class="kit-item">
      <div class="kit-item-top">
        <span class="kit-tag">Support</span>
      </div>
      <div class="kit-item-text">${escapeHtml(person)}</div>
      <div class="kit-actions">
        <button class="kit-action" onclick="editToolkitPerson(${i})">Edit</button>
        <button class="kit-action danger" onclick="deleteToolkitPerson(${i})">Remove</button>
      </div>
    </div>`).join('');
  const html=phraseItems + personItems;
  el.innerHTML=html || '<div class="kit-empty">Nothing saved yet. Add a phrase or a safe person above to build your toolkit.</div>';
}

function editToolkitPhrase(i){
  const phrase=S.toolkit?.phrases?.[i];
  const input=document.getElementById('kit-phrase');
  if(!phrase||!input)return;
  input.value=phrase;
  KIT_EDIT.phrase=i;
  updateToolkitButtons();
}

function editToolkitPerson(i){
  const person=S.toolkit?.people?.[i];
  const input=document.getElementById('kit-person');
  if(!person||!input)return;
  input.value=person;
  KIT_EDIT.person=i;
  updateToolkitButtons();
}

function deleteToolkitPhrase(i){
  if(!S.toolkit?.phrases?.[i])return;
  S.toolkit.phrases.splice(i,1);
  if(KIT_EDIT.phrase===i)KIT_EDIT.phrase=-1;
  finishToolkitSave('Phrase removed');
}

function deleteToolkitPerson(i){
  if(!S.toolkit?.people?.[i])return;
  S.toolkit.people.splice(i,1);
  if(KIT_EDIT.person===i)KIT_EDIT.person=-1;
  finishToolkitSave('Support removed');
}

function renderToolkitSummary(){
  const el=document.getElementById('kit-summary');
  if(!el)return;
  S.toolkit=normalizeToolkit(S.toolkit);
  const phrase=S.toolkit.phrases[0] || 'No phrase saved yet.';
  const person=S.toolkit.people[0] || 'No safe person saved yet.';
  el.innerHTML=`<strong>Saved Toolkit</strong>
    <div class="kit-summary-line">Go-to phrase: ${escapeHtml(phrase)}</div>
    <div class="kit-summary-line">Safe support: ${escapeHtml(person)}</div>`;
}

// ══════════════════════════════════════
// PROFILE / BADGES
// ══════════════════════════════════════
function checkBadges(){
  BADGES.forEach(b=>{
    try{if(b.cond()&&!S.done['badge_'+b.id]){S.done['badge_'+b.id]=true;toast('🏅 Badge: '+b.nm);}}catch(e){}
  });
}

function renderProfile(){
  renderAvatarPicker();
  document.getElementById('pname').textContent=S.name;
  document.getElementById('plvl').textContent='Level '+S.level+' · '+levelTitle(S.level);
  document.getElementById('avi').textContent=S.avi;
  document.getElementById('p-streak').textContent=S.streak;
  document.getElementById('p-xp').textContent=S.xp;
  document.getElementById('p-lessons').textContent=S.totalLessons;
  checkBadges();
  const bg=document.getElementById('badge-grid');
  bg.innerHTML=BADGES.map(b=>{
    const earned=S.done['badge_'+b.id];
    return `<div class="bdg-wrap"><div class="bring ${earned?'bearned':'blocked-badge'}">${b.ic}</div><div class="bname">${b.nm}</div></div>`;
  }).join('');
  const pr=document.getElementById('mod-progress-rows');
  pr.innerHTML=Object.entries(MODS).filter(([,m])=>!m.locked||S.unlockAll).map(([k,m])=>{
    const done=m.lessons.filter((_,i)=>S.done[k+'_'+i]).length;
    const pct=m.lessons.length?Math.round(done/m.lessons.length*100):0;
    return `<div class="mrow-p"><div class="mric" style="background:${m.bgc}">${m.icon}</div>
      <div class="mrinfo"><div class="mrtitle">${m.title}</div><div class="mrsub">${done} of ${m.lessons.length} lessons</div></div>
      <span style="font-size:12px">${renderStars(pct)}</span></div>`;
  }).join('');
}

function renderAvatarPicker(){
  const picker=document.getElementById('avi-picker');
  if(!picker)return;
  picker.innerHTML=AVATAR_OPTIONS.map(emoji=>
    `<div class="avi-o${S.avi===emoji?' active':''}" onclick="setAvi('${emoji}')">${emoji}</div>`
  ).join('');
}

function toggleAvi(){
  const p=document.getElementById('avi-picker');
  p.classList.toggle('open');
}
function setAvi(e){
  S.avi=e;
  document.getElementById('avi').textContent=e;
  renderAvatarPicker();
  document.getElementById('avi-picker').classList.remove('open');
  saveProfileToServer();
}

function openProvSheet(){
  checkBadges();
  const earnedBadges=BADGES.filter(b=>S.done['badge_'+b.id]);
  document.getElementById('prov-summary').innerHTML=`
    <div style="background:var(--iv-mid);border-radius:14px;padding:14px;margin-bottom:12px">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><span style="font-size:18px">👤</span><div><div style="font-size:13px;font-weight:900;color:var(--br)">${S.name}</div><div style="font-size:11px;color:var(--br-mid)">Level ${S.level} · ${S.xp} total XP</div></div></div>
      <div style="font-size:12px;color:var(--br-mid);line-height:1.7">
        <b>Streak:</b> ${S.streak} day${S.streak!==1?'s':''} ·
        <b>Lessons completed:</b> ${S.totalLessons} ·
        <b>Journal entries:</b> ${S.journal.length}<br>
        <b>Badges earned:</b> ${earnedBadges.length>0?earnedBadges.map(b=>b.ic+' '+b.nm).join(', '):'None yet'}
      </div>
    </div>`;
  document.getElementById('prov-overlay').classList.add('open');
}
function copyProvSummary(){
  document.getElementById('prov-overlay').classList.remove('open');
  toast('📋 Progress summary copied!');
}

// ══════════════════════════════════════
// TEXT LINE
// ══════════════════════════════════════
function initChat(){
  if(S.chat.length===0){
    S.chat.push({role:'bot',txt:"Hey, welcome 🌿 I'm here to listen. This is a safe, private space. What's on your mind today?"});
  }
  renderChat();
}

function renderChat(){
  const box=document.getElementById('tl-msgs');
  box.innerHTML=S.chat.map(m=>{
    if(m.typing)return`<div class="mwrap"><div class="mav">🌿</div><div class="typing-bub"><div class="td"></div><div class="td"></div><div class="td"></div></div></div>`;
    if(m.role==='bot')return`<div class="mwrap"><div class="mav">🌿</div><div class="mbub bot${m.crisis?' crisis':''}">${m.txt}</div></div>`;
    return`<div class="mwrap me"><div class="mbub me">${m.txt}</div></div>`;
  }).join('');
  box.scrollTop=box.scrollHeight;
}

function sendChat(){
  const inp=document.getElementById('tl-inp');
  const txt=inp.value.trim();
  if(!txt||S.chatBusy)return;
  inp.value='';
  S.chat.push({role:'user',txt});
  S.chatBusy=true;
  S.chat.push({typing:true});
  renderChat();
  setTimeout(()=>{
    S.chat=S.chat.filter(m=>!m.typing);
    const match=BOT.find(r=>r.p.test(txt));
    const fallbacks=["That took courage to share. Can you tell me more?","I hear you. What's been weighing on you most?","Thank you for being open. What do you need right now?","I want to make sure I understand — can you share more?"];
    const rep=match||{txt:fallbacks[Math.floor(Math.random()*fallbacks.length)]};
    S.chat.push({role:'bot',txt:rep.t||rep.txt,crisis:rep.crisis||false});
    S.chatBusy=false;
    renderChat();
  },1200+Math.random()*800);
}

// ══════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════
function openSettings(){
  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('session-xp-tag').textContent='+'+S.sessionXp+' XP';
  const ut=document.getElementById('unlock-toggle');
  ut.classList.toggle('on',S.unlockAll);
  renderThemePicker();
  applyTheme(S.settings.theme);
}
function closeSettings(){document.getElementById('settings-overlay').classList.remove('open');}
function closeSettingsIfBg(e){if(e.target===document.getElementById('settings-overlay'))closeSettings();}
function closeProvIfBg(e){if(e.target===document.getElementById('prov-overlay'))document.getElementById('prov-overlay').classList.remove('open');}

function toggleUnlockAll(){
  S.unlockAll=!S.unlockAll;
  document.getElementById('unlock-toggle').classList.toggle('on',S.unlockAll);
  toast(S.unlockAll?'🔓 All lessons unlocked':'🔒 Progressive unlock on');
  renderCourses();
  saveProfileToServer();
}

function toggleSetting(key){
  S.settings[key]=!S.settings[key];
  document.getElementById(key+'-toggle').classList.toggle('on',S.settings[key]);
  saveProfileToServer();
}

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
let toastTimer=null;
function toast(msg){
  const el=document.getElementById('toast');
  if(!el)return;
  clearTimeout(toastTimer);
  el.classList.remove('show');
  el.textContent=msg;
  void el.offsetWidth;
  el.classList.add('show');
  toastTimer=setTimeout(()=>{
    el.classList.remove('show');
  },2400);
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
// ── INIT COMPLETE ──
window.addEventListener('load', async ()=>{
  S.settings=normalizeSettings(S.settings);
  applyTheme(S.settings.theme);
  await loadScreenPages();
  renderThemePicker();
  applyTheme(S.settings.theme);
  await loadAppConfig();
  initGoogleAuth();
  loadProfileFromServer();
  const nameEl = document.getElementById('landing-name');
  if(nameEl) nameEl.addEventListener('keydown', e=>{ if(e.key==='Enter') startApp(); });
  const authEmailEl = document.getElementById('auth-email');
  const authPasswordEl = document.getElementById('auth-password');
  const authNameEl = document.getElementById('auth-name');
  if(authEmailEl) authEmailEl.addEventListener('keydown', e=>{ if(e.key==='Enter') loginEmail(); });
  if(authPasswordEl) authPasswordEl.addEventListener('keydown', e=>{ if(e.key==='Enter') loginEmail(); });
  if(authNameEl) authNameEl.addEventListener('keydown', e=>{ if(e.key==='Enter') registerEmail(); });
  const homeAff = document.getElementById('home-aff'); if(homeAff) homeAff.textContent = AFFS[0].t;
  const actAff = document.getElementById('act-aff'); if(actAff) actAff.textContent = AFFS[0].t;
});
