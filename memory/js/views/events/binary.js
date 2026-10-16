import { makeDigitEvent } from './numbers.js';

const lv = (count, memTime, recallTime, label = `${count} digits`) => ({ label, cfg: { count, memTime, recallTime } });

export default makeDigitEvent({
  id: 'binary',
  name: 'Binary Digits',
  blurb: 'Rows of 0s and 1s. Convert each group of three into a decimal digit, then use your number images.',
  alphabet: '01',
  rowSize: () => 30,
  groupOptions: [3, 6],
  defaultGroup: 3,
  levels: [
    lv(30, 60, 120),
    lv(48, 90, 150),
    lv(60, 120, 180),
    lv(90, 150, 240),
    lv(120, 180, 300),
    lv(180, 240, 420),
    lv(240, 300, 540, '240 digits · 5 min'),
    lv(300, 300, 600, '300 digits · 5 min'),
  ],
  tips: `
    <p>Binary is easy once you learn the conversion. Each group of three binary digits is a number 0–7:</p>
    <table><thead><tr><th>Binary</th><th>Digit</th><th>Binary</th><th>Digit</th></tr></thead><tbody>
      <tr><td class="mono">000</td><td>0</td><td class="mono">100</td><td>4</td></tr>
      <tr><td class="mono">001</td><td>1</td><td class="mono">101</td><td>5</td></tr>
      <tr><td class="mono">010</td><td>2</td><td class="mono">110</td><td>6</td></tr>
      <tr><td class="mono">011</td><td>3</td><td class="mono">111</td><td>7</td></tr>
    </tbody></table>
    <ul>
      <li>Read six binary digits as <b>two</b> decimal digits, then use your Major image: <span class="mono">101 011</span> → 5 3 → <i>lime</i>.</li>
      <li>Rows are 30 digits = 5 images. Two images per locus is a good starting pace.</li>
      <li>Practise the conversion until it is instant. Set the group size to 3 so each triplet is highlighted.</li>
    </ul>`,
});
