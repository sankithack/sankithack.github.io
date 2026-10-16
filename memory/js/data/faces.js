// Portrait photos for Names & Faces: real people photographed for Unsplash (Unsplash License),
// cropped to the face. Credits: faces/CREDITS.md. Names in the app are random, not theirs.
// Each entry is the file number plus f/m, used to give the face a fitting first name.
const RAW = [
  '000m', '001m', '002m', '003m', '004m', '005m', '006m', '007m', '008m', '009m', '010m', '011m',
  '012m', '013m', '014f', '015f', '016f', '017f', '018f', '019f', '020f', '021m', '022m', '023m',
  '024m', '025m', '026m', '027m', '028m', '029m', '030m', '031m', '032m', '033m', '034m', '035m',
  '036m', '037f', '038f', '039f', '040f', '041f', '042f', '043f', '044f', '045f', '046f', '047f',
  '048f', '049m', '050m', '051m', '052m', '053m', '054m', '055m', '056m', '057m', '058f', '059f',
  '060f', '061f', '062f', '063f', '064f', '065f', '066f', '067f', '068f', '069f', '070f', '071f',
  '072f', '073f', '074f', '075f', '076f', '077f', '078f', '079f', '080f', '081f', '082f', '083f',
  '084f', '085f', '086f', '087f', '088f', '089f', '090f', '091f', '092f', '093f', '094f', '095f',
  '096f', '097m', '098f', '099m', '100m',
];

export const FACES = RAW.map((s) => ({ file: `faces/${s.slice(0, 3)}.jpg`, femme: s[3] === 'f' }));
