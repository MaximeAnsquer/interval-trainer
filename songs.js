// Intervalles et chansons de référence
// Sources : Musicca (interval song chart), EarMaster (interval song chart generator)

const INTERVALS = [
  { id: "m2", name: "Seconde mineure", short: "2m", semitones: 1 },
  { id: "M2", name: "Seconde majeure", short: "2M", semitones: 2 },
  { id: "m3", name: "Tierce mineure", short: "3m", semitones: 3 },
  { id: "M3", name: "Tierce majeure", short: "3M", semitones: 4 },
  { id: "P4", name: "Quarte juste", short: "4J", semitones: 5 },
  { id: "TT", name: "Triton", short: "4+", semitones: 6 },
  { id: "P5", name: "Quinte juste", short: "5J", semitones: 7 },
  { id: "m6", name: "Sixte mineure", short: "6m", semitones: 8 },
  { id: "M6", name: "Sixte majeure", short: "6M", semitones: 9 },
  { id: "m7", name: "Septième mineure", short: "7m", semitones: 10 },
  { id: "M7", name: "Septième majeure", short: "7M", semitones: 11 },
  { id: "P8", name: "Octave", short: "8", semitones: 12 },
];

// Ordre de déblocage progressif : on commence par les intervalles les plus
// faciles à distinguer, puis on ajoute un intervalle à chaque niveau.
const UNLOCK_ORDER = ["P5", "P8", "M3", "P4", "m3", "M2", "m2", "M6", "m6", "m7", "M7", "TT"];

// Chansons célèbres par intervalle et direction (asc = ascendant, desc = descendant)
const SONGS = {
  m2: {
    asc: [
      { title: "Les Dents de la mer (thème)", artist: "John Williams" },
      { title: "Isn't She Lovely", artist: "Stevie Wonder" },
      { title: "White Christmas", artist: "Irving Berlin" },
      { title: "A Hard Day's Night", artist: "The Beatles" },
    ],
    desc: [
      { title: "Für Elise (La Lettre à Élise)", artist: "Beethoven" },
      { title: "Fly Me to the Moon", artist: "Frank Sinatra" },
      { title: "Joy to the World", artist: "chant de Noël" },
      { title: "Fields of Gold", artist: "Sting" },
    ],
  },
  M2: {
    asc: [
      { title: "Frère Jacques", artist: "comptine" },
      { title: "Joyeux anniversaire (Happy Birthday)", artist: "traditionnel" },
      { title: "Au clair de la lune", artist: "comptine" },
      { title: "Never Gonna Give You Up", artist: "Rick Astley" },
    ],
    desc: [
      { title: "Yesterday", artist: "The Beatles" },
      { title: "Mary Had a Little Lamb", artist: "comptine" },
      { title: "Wonderwall", artist: "Oasis" },
      { title: "The First Noel", artist: "chant de Noël" },
    ],
  },
  m3: {
    asc: [
      { title: "Greensleeves", artist: "traditionnel" },
      { title: "Axel F (Le Flic de Beverly Hills)", artist: "Harold Faltermeyer" },
      { title: "Georgia on My Mind", artist: "Ray Charles" },
      { title: "Ô Canada (hymne)", artist: "Calixa Lavallée" },
    ],
    desc: [
      { title: "Hey Jude", artist: "The Beatles" },
      { title: "Frosty the Snowman", artist: "chant de Noël" },
      { title: "The Star-Spangled Banner (hymne américain)", artist: "traditionnel" },
      { title: "Au matin (Peer Gynt)", artist: "Grieg" },
    ],
  },
  M3: {
    asc: [
      { title: "Oh, When the Saints", artist: "gospel" },
      { title: "Le Printemps (Les Quatre Saisons)", artist: "Vivaldi" },
      { title: "For He's a Jolly Good Fellow", artist: "traditionnel" },
      { title: "Morning Has Broken", artist: "Cat Stevens" },
    ],
    desc: [
      { title: "Symphonie n°5 (« pom pom pom pooom »)", artist: "Beethoven" },
      { title: "Swing Low, Sweet Chariot", artist: "gospel" },
      { title: "Summertime", artist: "Gershwin" },
      { title: "Tears in Heaven", artist: "Eric Clapton" },
    ],
  },
  P4: {
    asc: [
      { title: "La Marseillaise (« Allons en-fants »)", artist: "hymne français" },
      { title: "Amazing Grace", artist: "gospel" },
      { title: "Marche nuptiale (Here Comes the Bride)", artist: "Wagner" },
      { title: "Love Me Tender", artist: "Elvis Presley" },
      { title: "We Wish You a Merry Christmas", artist: "chant de Noël" },
    ],
    desc: [
      { title: "Une petite musique de nuit", artist: "Mozart" },
      { title: "I've Been Working on the Railroad", artist: "traditionnel" },
      { title: "O Come, All Ye Faithful", artist: "chant de Noël" },
      { title: "All of Me", artist: "standard de jazz" },
    ],
  },
  TT: {
    asc: [
      { title: "Les Simpson (thème)", artist: "Danny Elfman" },
      { title: "Maria (West Side Story)", artist: "Leonard Bernstein" },
    ],
    desc: [
      { title: "YYZ", artist: "Rush" },
      { title: "Even Flow", artist: "Pearl Jam" },
      { title: "Blue 7", artist: "Sonny Rollins" },
    ],
  },
  P5: {
    asc: [
      { title: "Star Wars (thème principal)", artist: "John Williams" },
      { title: "Ah ! vous dirai-je, maman (Twinkle Twinkle)", artist: "comptine" },
      { title: "Scarborough Fair", artist: "traditionnel" },
      { title: "Can't Help Falling in Love", artist: "Elvis Presley" },
      { title: "Top Gun Anthem", artist: "Harold Faltermeyer" },
    ],
    desc: [
      { title: "Les Pierrafeu / The Flintstones (thème)", artist: "Hoyt Curtin" },
      { title: "Menuet en sol majeur", artist: "Petzold (attr. Bach)" },
      { title: "The Way You Look Tonight", artist: "Fred Astaire" },
    ],
  },
  m6: {
    asc: [
      { title: "Go Down Moses", artist: "gospel" },
      { title: "Valse en do dièse mineur", artist: "Chopin" },
      { title: "In My Life (intro)", artist: "The Beatles" },
      { title: "A Town With An Ocean View (Kiki la petite sorcière)", artist: "Joe Hisaishi" },
    ],
    desc: [
      { title: "Love Story (thème)", artist: "Francis Lai" },
      { title: "Chega de Saudade", artist: "Jobim" },
      { title: "Forêts paisibles (Les Indes galantes)", artist: "Rameau" },
    ],
  },
  M6: {
    asc: [
      { title: "Comme d'habitude / My Way", artist: "Claude François / Sinatra" },
      { title: "My Bonnie Lies Over the Ocean", artist: "traditionnel" },
      { title: "Nocturne op. 9 n° 2", artist: "Chopin" },
      { title: "Brindisi (La Traviata)", artist: "Verdi" },
    ],
    desc: [
      { title: "Nobody Knows the Trouble I've Seen", artist: "gospel" },
      { title: "The Music of the Night (Le Fantôme de l'Opéra)", artist: "Lloyd Webber" },
      { title: "Man in the Mirror (refrain)", artist: "Michael Jackson" },
      { title: "No Surprises", artist: "Radiohead" },
    ],
  },
  m7: {
    asc: [
      { title: "Maman les p'tits bateaux", artist: "comptine" },
      { title: "Star Trek (thème original)", artist: "Alexander Courage" },
      { title: "Somewhere (West Side Story)", artist: "Leonard Bernstein" },
      { title: "The Winner Takes It All (refrain)", artist: "ABBA" },
    ],
    desc: [
      { title: "Un Américain à Paris", artist: "Gershwin" },
      { title: "Watermelon Man", artist: "Herbie Hancock" },
      { title: "Lady Jane (refrain)", artist: "The Rolling Stones" },
    ],
  },
  M7: {
    asc: [
      { title: "Take On Me (refrain)", artist: "A-ha" },
      { title: "Don't Know Why", artist: "Norah Jones" },
      { title: "Popular", artist: "Nada Surf" },
    ],
    desc: [
      { title: "I Love You", artist: "Cole Porter" },
    ],
  },
  P8: {
    asc: [
      { title: "Over the Rainbow (« Some-where »)", artist: "Judy Garland" },
      { title: "Singin' in the Rain", artist: "Gene Kelly" },
      { title: "The Christmas Song", artist: "Nat King Cole" },
      { title: "Ironic", artist: "Alanis Morissette" },
    ],
    desc: [
      { title: "Willow Weep for Me", artist: "standard de jazz" },
      { title: "To Zanarkand (Final Fantasy X)", artist: "Nobuo Uematsu" },
      { title: "Doogie Howser (thème)", artist: "Mike Post" },
    ],
  },
};
