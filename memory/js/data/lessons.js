// Beginner lessons. Body is trusted HTML; {{placeholders}} are filled in by views/learn.js.
// `exercise` names a mini-exercise implemented in views/learn.js.

export const LESSONS = [
  {
    id: 'palace',
    title: 'The Memory Palace',
    minutes: 8,
    summary: 'The method of loci: the single most important technique in memory sport.',
    exercise: 'palace',
    body: `
<p>Every memory champion uses the same trick, and it is over 2,000 years old. Your brain is bad at remembering lists of abstract things, but very good at remembering <b>places</b> and <b>vivid pictures</b>. A memory palace combines the two.</p>

<h2>What it is</h2>
<p>A memory palace (the <i>method of loci</i>, Latin for "places") is a route through a place you already know well, such as your home, your street or your school. Along the route you pick a fixed sequence of spots called <b>loci</b> (singular <i>locus</i>), or stations. To memorize something, you turn each item into a picture and "place" it at the next locus. To recall, you walk the route in your mind and look at what is waiting at each spot.</p>

<h2>How to build your first palace</h2>
<ol>
  <li><b>Pick a place you know very well.</b> Your own home is ideal.</li>
  <li><b>Choose a route</b> that always goes the same direction, e.g. clockwise through each room. No crossing back over your path.</li>
  <li><b>Pick 10 distinct spots</b> along the route: front door, doormat, coat hook, hallway mirror, kitchen sink, fridge, stove… Choose things that differ in shape and position. Avoid ten identical chairs.</li>
  <li><b>Walk it mentally</b> forwards a few times, then try backwards. You should be able to name every locus instantly.</li>
  <li><b>Write it down</b> in the <a href="#/palaces">Palace Builder</a> so you can practise it.</li>
</ol>
<div class="callout"><p><b>Tip:</b> Competitors own dozens of palaces with hundreds of loci. Start with one palace of 10 loci, then add a second room, then a second building. One full deck of cards needs 26 loci (two cards per locus) or 18 (three cards per locus).</p></div>

<h2>How to place images</h2>
<ul>
  <li><b>Interact with the locus.</b> Don't just set the item down. Make it smash, melt, cover or ride the spot. A <i>banana</i> at the <i>front door</i> becomes a giant banana jammed in the doorway, slowly being squished.</li>
  <li><b>Use all your senses.</b> Hear it, smell it, feel it.</li>
  <li><b>One scene per locus.</b> Keep loci separate; don't let images spill over to the next spot.</li>
  <li><b>Pause for a heartbeat</b> at each locus when memorizing. Speed comes later.</li>
</ul>

<div class="example">
  <p><b>Example: shopping list</b> (eggs, milk, bread, batteries, roses)</p>
  <ol class="mb0">
    <li><i>Front door:</i> eggs are smashed against the door, yolk dripping down.</li>
    <li><i>Doormat:</i> the mat is a soggy sponge squirting milk when you step on it.</li>
    <li><i>Coat hook:</i> a baguette is hanging there instead of your coat, and you put it on.</li>
    <li><i>Mirror:</i> batteries are sparking out of the mirror, zapping your reflection.</li>
    <li><i>Kitchen sink:</i> the tap gushes red roses with thorns that prick your hands.</li>
  </ol>
</div>
<p>Now close your eyes and walk the route. You will probably recall all five without effort, which is the magic of the technique.</p>`,
  },
  {
    id: 'images',
    title: 'Making Memorable Images',
    minutes: 6,
    summary: 'Turn boring information into scenes your brain can’t forget.',
    exercise: 'pairs',
    body: `
<p>A memory palace is only as good as the images you put in it. A plain, sensible picture fades in minutes. A strange, emotional, moving one can last for weeks.</p>

<h2>The four boosters</h2>
<ul>
  <li><b>Exaggeration:</b> make it huge, tiny, or multiplied. Not one cat, but a thousand cats.</li>
  <li><b>Action:</b> things that move are memorable. Explode, spin, chase, crash, melt.</li>
  <li><b>Emotion:</b> disgust, fear, love, pain, delight. Feel it.</li>
  <li><b>Humor and absurdity:</b> the weirder, the better. A penguin doing your taxes.</li>
</ul>
<p>Other helpers: <b>colour</b>, <b>sound</b>, <b>smell</b>, <b>touch</b>, and involving <b>yourself</b> in the scene.</p>

<h2>Abstract words</h2>
<p>For words you can't picture, use a <b>substitute</b>: something that sounds similar or that symbolises the word. <i>Justice</i> becomes a judge's gavel; <i>freedom</i> a bird bursting out of a cage; <i>Michigan</i> could be "<i>Mitt</i>-chicken": a baseball mitt catching a chicken.</p>

<h2>Linking two images</h2>
<p>When you must connect two things (a name and a face, a word pair, a number and a fact), make them <b>interact</b> in one scene. "<i>Dog – piano</i>": a dog is playing a grand piano with its paws, howling along. Interaction is the glue.</p>

<div class="example">
  <p class="mb0"><b>Weak:</b> a dog next to a piano. <br><b>Strong:</b> a slobbering dog slams the piano lid on its own tail and yelps in perfect pitch.</p>
</div>
<div class="callout"><p>At competition speed you won't have time for a short film at each locus. Practise vivid images now; they get faster and simpler with repetition, and your brain fills in the detail automatically.</p></div>`,
  },
  {
    id: 'major',
    title: 'The Major System for Numbers',
    minutes: 12,
    summary: 'Turn every digit into a sound, so any number becomes a word.',
    exercise: 'major',
    body: `
<p>Digits are abstract, so your brain can't hold on to them. The Major System turns each digit into a <b>consonant sound</b>. Vowels (and w, h, y) are free fillers. That way every number can become a picturable word.</p>

<h2>The digit-to-sound rules</h2>
{{majorRules}}
<p>It is about <b>sounds, not spelling</b>: "<i>knife</i>" is n-f = 28 (the k is silent), "<i>phone</i>" is f-n = 82, and double letters count once ("<i>bell</i>" = 95).</p>

<h2>From number to image</h2>
<p>Write the sounds, then add vowels until you get a concrete noun:</p>
<div class="example">
  <p class="mb0">32 → m, n → <b>moon</b> &nbsp;·&nbsp; 71 → k, t → <b>cat</b> &nbsp;·&nbsp; 94 → b, r → <b>bear</b> &nbsp;·&nbsp; 0 6 → s, sh → <b>sushi</b></p>
</div>

<h2>Your 00–99 list</h2>
<p>Serious memorizers learn one fixed image for every pair 00–99, so they never have to "work out" a word during an event. A long number like <b>3271 9406</b> becomes four images, <i>moon, cat, bear, sushi</i>, placed two per locus in your palace.</p>
<p>Here is your current list. The defaults follow the rules, but <b>images you choose yourself stick better</b>. Edit any of them in <a href="#/learn/systems/major">your Major list</a>, then drill them in the <a href="#/train/numbers">numbers trainer</a> until each image pops up in under a second.</p>
{{majorRef}}
<div class="callout"><p><b>Plan:</b> learn 10 new images a day (00–09, then 10–19…). After 10 days you have the whole list. Keep reviewing with spaced repetition and start the Speed Numbers event at 10 digits.</p></div>`,
  },
  {
    id: 'pao',
    title: 'PAO: Person–Action–Object',
    minutes: 10,
    summary: 'Pack six digits or three cards into one vivid scene.',
    exercise: 'pao',
    body: `
<p>Once your 00–99 images are automatic, PAO lets you compress more information into each locus. Each 2-digit number gets <b>three</b> images: a <b>Person</b>, an <b>Action</b> that person typically does, and an <b>Object</b>.</p>

<h2>How it works for numbers</h2>
<p>Split a number into groups of six digits. The first pair gives the <b>person</b>, the second pair gives the <b>action</b>, the third the <b>object</b>.</p>
<div class="example">
  <p>Suppose 34 = <i>Magician / pushing / mower</i>, 71 = <i>Clown / petting / cat</i>, 05 = <i>Soldier / balancing / seal</i>.</p>
  <p class="mb0"><b>347105</b> → Person 34 (<i>Magician</i>), Action 71 (<i>petting</i>), Object 05 (<i>seal</i>) → <b>a magician petting a seal</b>. One scene, one locus, six digits.</p>
</div>
<p>Because every pair has all three roles, the same number gives a different scene depending on its position, so you never confuse 34-71-05 with 05-71-34.</p>

<h2>PAO for cards</h2>
<p>Each card gets a person, action and object. Three cards make one scene: the first card's person does the second card's action to the third card's object. A deck of 52 cards then needs only 18 loci.</p>

<h2>Choosing your persons</h2>
<ul>
  <li>Use people who mean something to you, such as family, friends, celebrities and characters, and give each a <b>signature action</b> and <b>prop</b> (a chef → chopping → knife).</li>
  <li>You can link persons to the Major sounds (e.g. initials) or to your existing Major images.</li>
  <li>Start with the starter list and swap in your own people gradually in <a href="#/learn/systems/pao">your PAO list</a>.</li>
</ul>
<div class="callout warn"><p><b>Don't rush PAO.</b> Learn a solid 00–99 Major list and a card list first (weeks 1–3). PAO is week 4 and beyond.</p></div>`,
  },
  {
    id: 'cards',
    title: 'Your Card System',
    minutes: 8,
    summary: 'Give each of the 52 cards a fixed image so a shuffled deck becomes a story.',
    exercise: 'cards',
    body: `
<p>Speed Cards is the classic memory-sport event: memorize a shuffled deck, then rebuild it in order. Top competitors do it in under 20 seconds, but they all started where you are, at 5 cards.</p>

<h2>One image per card</h2>
<p>The simplest system is a fixed image for every card. Your starter list uses this pattern:</p>
<ul>
  <li>The image starts with the <b>suit's letter</b>: <b>S</b>pades, <b>H</b>earts, <b>D</b>iamonds, <b>C</b>lubs.</li>
  <li>Its next consonant sound is the <b>rank</b>, using the Major System: Ace = 1 (t/d), 2 = n, 3 = m … 9 = p/b, 10 = s.</li>
  <li>Jacks, queens and kings are characters (King of Hearts = <i>Romeo</i>).</li>
</ul>
<div class="example">
  <p class="mb0">5♦ → D + l → <b>dolphin</b> &nbsp;·&nbsp; 2♣ → C + n → <b>canoe</b> &nbsp;·&nbsp; 9♥ → H + p → <b>hippo</b> &nbsp;·&nbsp; A♠ → S + d → <b>saddle</b></p>
</div>
<p>Another popular option is to convert each card to a two-digit number (e.g. Spades 1x, Hearts 2x…) and reuse your Major images, though that means cards and numbers share images.</p>

<h2>Memorizing a deck</h2>
<ol>
  <li>Look at the card, see its image immediately (this is what the <a href="#/train/cards">card trainer</a> is for).</li>
  <li>Place <b>two cards per locus</b>: the images interact (a dolphin paddling a canoe).</li>
  <li>For recall, walk your palace and rebuild the order.</li>
</ol>
<p>Customize any image in <a href="#/learn/systems/cards">your card list</a>. When you're ready for PAO, use <a href="#/learn/systems/cardPao">card PAO</a>.</p>`,
  },
  {
    id: 'names',
    title: 'Names & Faces',
    minutes: 8,
    summary: 'Link a name to a striking feature of the face.',
    exercise: 'names',
    body: `
<p>Forgetting names isn't a sign of a bad memory: names are abstract sounds attached to a face for no reason. The fix is to <b>give the name a meaning</b> and <b>pin it to the face</b>.</p>

<h2>The three-step method</h2>
<ol>
  <li><b>Pick a feature.</b> Look at the face and choose the first thing that stands out: big glasses, curly hair, a beard, a wide smile, bright earrings.</li>
  <li><b>Make the name into an image.</b> Use sound-alikes or associations: <i>Rosa</i> → roses; <i>Hector</i> → a tractor; <i>Bell</i> → a bell; <i>Kumar</i> → "cool mar(ble)"; <i>Nash</i> → gnashing teeth.</li>
  <li><b>Link the image to the feature.</b> Make it interact and exaggerate: roses sprouting out of Rosa's curly hair; tiny tractors driving over Hector's eyebrows.</li>
</ol>

<h2>Surnames</h2>
<p>Do the same for the last name and add it to the scene: <i>Rosa Fischer</i> → roses in her hair, and a fish jumping out of the bouquet.</p>

<h2>Common name images</h2>
<p>Build a personal dictionary of images for common names. Once <i>Daniel</i> is always a lion (Daniel in the lions' den) and <i>Taylor</i> is always a tailor's measuring tape, you'll get much faster.</p>

<div class="callout"><p>In competition, faces appear in a different order at recall. Rely on the face and feature, not on the position.</p></div>`,
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);
