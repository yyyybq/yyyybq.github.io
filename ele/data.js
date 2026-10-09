// ─────────────────────────────────────────────────────────────
// Site configuration. Edit this block; everything else is driven by it.
// Empty strings / arrays hide the corresponding element.
// ─────────────────────────────────────────────────────────────
window.ELE_CONFIG = {
  scene: {
    // Full-page viewer of Home1. Opened in a new tab, or embedded inline
    // when this page is served from the same origin as the viewer
    // (the viewer sends `frame-ancestors 'self'`).
    url: "https://embodied-last-exam.pages.dev/viewer/",
    inviteCode: "", // shown on the page when set; leave empty to keep it private
    name: "Home1",
  },
  links: {
    report: "", // PDF / arXiv link
    code: "",
    data: "",
  },
  // e.g. [{ name: "Baiqiao Yin", aff: "1", note: "*" }]
  authors: [],
  // e.g. [{ id: "1", name: "University" }]
  affiliations: [],
  bibtex: `@misc{ele2026,
  title  = {Embodied Last Exam: Towards a Next Generation Inverted Benchmark},
  author = {ELE Team},
  year   = {2026},
  note   = {Project page}
}`,
};

// ─────────────────────────────────────────────────────────────
// Media manifest
// ─────────────────────────────────────────────────────────────
const V = (slug) => ({ src: `assets/video/${slug}.mp4`, poster: `assets/poster/${slug}.webp` });

// Long-horizon robot episodes. `realtime` = wall-clock length (s) of the
// uncompressed 1× recording, reasoning included.
window.ELE_ROLLOUTS = [
  {
    id: "desk",
    title: "Tidy the desk",
    room: "Study",
    summary:
      "The robot tidies the study desk end to end. World time keeps running while the model reasons, so planning cost is visible on the clock.",
    realtime: 12947,
    views: [
      { label: "Actions 4× · Reasoning 40×", ...V("rollout-desk-40x") },
      { label: "Actions 4× · Reasoning 100×", ...V("rollout-desk-100x") },
      { label: "Overview 10× · earlier run", ...V("rollout-desk-overview-10x") },
    ],
  },
  {
    id: "coffee",
    title: "Make a coffee",
    room: "Kitchen",
    summary: "Operate the kitchen coffee machine and prepare a cup, from approach to serving.",
    views: [
      { label: "With overlay", ...V("rollout-coffee-overlay") },
      { label: "Overview", ...V("rollout-coffee-overview") },
    ],
  },
  {
    id: "book",
    title: "Move the books",
    room: "Study",
    summary:
      "Carry books from the desk to the wall shelf, regrasping mid-transport. The inset view tracks the gripper.",
    realtime: 5342,
    views: [
      { label: "Actions 4× · Reasoning 40×", ...V("rollout-book-40x") },
      { label: "Actions 4× · Reasoning 100×", ...V("rollout-book-100x") },
    ],
  },
  {
    id: "groceries",
    title: "Put away groceries",
    room: "Kitchen",
    summary:
      "Store each item where it belongs: lemons in the basket, meat in the freezer drawer, milk in the fridge door.",
    realtime: 13934,
    views: [{ label: "Actions 4× · Reasoning 40×", ...V("rollout-groceries-40x") }],
  },
  {
    id: "breakfast",
    title: "Bacon & toast breakfast",
    room: "Kitchen",
    summary: "Prepare a breakfast of bacon and toast using the stove and kitchen appliances.",
    views: [
      { label: "Wide view", ...V("rollout-breakfast") },
      { label: "Earlier run", ...V("rollout-breakfast-earlier") },
    ],
  },
];

// Multi-stage tasks broken into their sub-steps (all clips at 4×).
window.ELE_STAGES = [
  {
    id: "book",
    title: "Move a book",
    steps: [
      { label: "Pick up book", ...V("stage-book-1-pick") },
      { label: "Move book + regrasp", ...V("stage-book-2-move") },
      { label: "Place on shelf", ...V("stage-book-3-place") },
    ],
    full: V("stage-book-full"),
  },
  {
    id: "desk",
    title: "Clean a spill",
    steps: [
      { label: "Pick up cloth", ...V("stage-desk-1-cloth") },
      { label: "Wipe spill", ...V("stage-desk-2-wipe") },
      { label: "Place mug on coaster", ...V("stage-desk-3-mug") },
    ],
    full: V("stage-desk-full"),
  },
  {
    id: "fruit",
    title: "Store fruit",
    steps: [
      { label: "Pick up lemon", ...V("stage-fruit-1-pick") },
      { label: "Place in basket", ...V("stage-fruit-2-place") },
    ],
  },
  {
    id: "meat",
    title: "Store meat",
    steps: [
      { label: "Open freezer door & drawer", ...V("stage-meat-1-open") },
      { label: "Pick up meat tray", ...V("stage-meat-2-pick") },
      { label: "Place in freezer", ...V("stage-meat-3-place") },
      { label: "Close drawer & door", ...V("stage-meat-4-close") },
    ],
  },
  {
    id: "milk",
    title: "Store milk",
    steps: [
      { label: "Open fridge door", ...V("stage-milk-1-open") },
      { label: "Pick up milk", ...V("stage-milk-2-pick") },
      { label: "Place in fridge", ...V("stage-milk-3-place") },
      { label: "Close fridge door", ...V("stage-milk-4-close") },
    ],
  },
];

// Close-up interaction gallery.
window.ELE_GALLERY_GROUPS = [
  { id: "cooking", label: "Cooking" },
  { id: "appliance", label: "Appliances" },
  { id: "furniture", label: "Furniture & doors" },
  { id: "chores", label: "Chores" },
];

window.ELE_GALLERY = [
  { title: "Turn the stove knob", group: "cooking", ...V("gallery-stove-knob") },
  { title: "Pan oil ignition", group: "cooking", ...V("gallery-oil-ignition") },
  { title: "Pour oil into the pan", group: "cooking", ...V("gallery-oil-pour") },
  { title: "Tilt the pan to spread oil", group: "cooking", ...V("gallery-pan-season") },
  { title: "Air fryer, end to end", group: "appliance", ...V("gallery-air-fryer") },
  { title: "Fridge doors and drawers", group: "appliance", ...V("gallery-fridge") },
  { title: "Kitchen cabinet doors", group: "furniture", ...V("gallery-cabinet") },
  { title: "Wardrobe doors", group: "furniture", ...V("gallery-wardrobe") },
  { title: "Move and tip over a chair", group: "furniture", ...V("gallery-chair") },
  { title: "Curtains and balcony door", group: "furniture", ...V("gallery-curtains") },
  { title: "Store shoes in the cabinet", group: "chores", ...V("gallery-shoes") },
  { title: "Screw in a light bulb", group: "chores", ...V("gallery-light-bulb") },
  { title: "Wipe the table", group: "chores", ...V("gallery-wipe-table") },
];

// Hotspots on the scene poster (percent of image box) → where they lead.
window.ELE_HOTSPOTS = [
  { label: "Kitchen", x: 55, y: 70, target: "gallery", filter: "cooking" },
  { label: "Study", x: 63, y: 21, target: "rollouts", rollout: "desk" },
  { label: "Living room", x: 46, y: 42, target: "gallery", filter: "furniture" },
  { label: "Balcony", x: 26, y: 27, target: "gallery", filter: "furniture" },
];
