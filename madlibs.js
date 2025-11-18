const MADLIB_TEMPLATES = [
  {
    id: "color-animal-verb",
    pattern: "The {color} {animal} will {verb} soon.",
    placeholders: ["color", "animal", "verb"]
  },
  {
    id: "adjective-object-verb",
    pattern: "A {adjective} {object} can {verb} today.",
    placeholders: ["adjective", "object", "verb"]
  },
  {
    id: "color-object-verbing",
    pattern: "Your {color} {object} is {verb_ing} now.",
    placeholders: ["color", "object", "verb_ing"]
  },
  {
    id: "adjective-object-place",
    pattern: "Please bring the {adjective} {object} to the {place}.",
    placeholders: ["adjective", "object", "place"]
  },
  {
    id: "person-adjective-animal-place",
    pattern: "{person} spots a {adjective} {animal} near the {place}.",
    placeholders: ["person", "adjective", "animal", "place"]
  },
  {
    id: "object-adjective-verb",
    pattern: "The {object} feels {adjective} when you {verb} it.",
    placeholders: ["object", "adjective", "verb"]
  }
];

const MADLIB_WORDS = {
  color: [
    "scarlet", "amber", "navy", "mint", "violet", "coral", "indigo", "sage",
    "copper", "peach", "teal", "ivory", "ruby", "silver", "golden", "emerald",
    "maroon", "turquoise", "lavender", "ochre"
  ],

  animal: [
    "otter", "panda", "falcon", "beagle", "turtle", "sparrow", "lemur", "bison",
    "rabbit", "badger", "heron", "gecko", "pelican", "corgi", "finch", "donkey",
    "walrus", "ferret", "oriole", "stingray"
  ],

  verb: [
    "dance", "glide", "whisper", "gather", "signal", "wander", "polish", "balance",
    "mend", "fetch", "spin", "shuffle", "circle", "toss", "stack", "guide",
    "steady", "follow", "point", "lift"
  ],

  adjective: [
    "brisk", "calm", "curious", "gentle", "lively", "mellow", "nimble", "bold",
    "bright", "quiet", "steady", "swift", "smooth", "tidy", "sturdy", "warm",
    "even", "fresh", "keen", "soft"
  ],

  object: [
    "lantern", "puzzle", "helmet", "rocket", "compass", "tablet", "backpack", "gadget",
    "notebook", "marker", "beacon", "camera", "basket", "marble", "coin", "mirror",
    "shovel", "torch", "anchor", "pillow"
  ],

  verb_ing: [
    "humming", "glowing", "floating", "twirling", "waiting", "marching", "resting", "sailing",
    "circling", "shining", "drifting", "wandering", "rolling", "pacing", "swaying", "beaming",
    "bouncing", "curling", "gliding", "buzzing"
  ],

  place: [
    "harbor", "meadow", "studio", "cabin", "plaza", "garden", "bridge", "valley",
    "forest", "shore", "courtyard", "village", "island", "station", "market", "hilltop",
    "tunnel", "landing", "harvest", "lagoon"
  ],

  person: [
    "Avery", "Jordan", "Casey", "Riley", "Morgan", "Taylor", "Rowan", "Quinn",
    "Parker", "Elliot", "Skyler", "Reese", "Alex", "Jamie", "Blair", "Devin",
    "Harper", "Linden", "Sage", "Finley"
  ]
};
