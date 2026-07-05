// B-Tree Playground — insert keys into an order-4 B-tree rendered as SVG,
// watch splits happen, and trace a search root-to-leaf.
import { h } from '../app/ui.js';

const ORDER = 4; // max children; max keys per node = 3

function makeNode(leaf = true) {
  return { keys: [], children: [], leaf, id: Math.random().toString(36).slice(2, 8) };
}

export function mount(root) {
  let tree = makeNode(true);
  let highlight = { nodes: new Set(), key: null };
  let lastMsg = 'Insert some keys to grow the tree. Nodes hold up to 3 keys; a 4th forces a split.';

  const input = h('input', { class: 'num-input viz-key-input', type: 'number', placeholder: 'key', inputmode: 'numeric' });
  const svgWrap = h('div', { class: 'btree-svg' });
  const msg = h('div', { class: 'stepper-note' });

  const insertB = h('button', { class: 'btn btn-accent', onclick: () => act('insert') }, 'Insert');
  const searchB = h('button', { class: 'btn', onclick: () => act('search') }, 'Search');

  root.append(
    h('p', { class: 'viz-intro' }, 'The index behind almost every database: a tree so shallow that finding one row in millions takes 3–4 page reads.'),
    h('div', { class: 'viz-controls' },
      input, insertB, searchB,
      h('button', { class: 'btn', onclick: () => { seedRandom(); } }, '+10 random'),
      h('button', { class: 'btn', onclick: () => { tree = makeNode(true); highlight = { nodes: new Set(), key: null }; lastMsg = 'Cleared.'; render(); } }, 'Clear')),
    msg, svgWrap);

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') act('insert'); });

  function act(kind) {
    const v = Number(input.value);
    if (!Number.isFinite(v) || input.value === '') { lastMsg = 'Type a number first.'; render(); return; }
    input.value = '';
    if (kind === 'insert') insertKey(Math.trunc(v));
    else searchKey(Math.trunc(v));
    render();
  }

  function seedRandom() {
    const used = new Set(allKeys(tree));
    let n = 0;
    while (n < 10) {
      const v = Math.floor(Math.random() * 99) + 1;
      if (used.has(v)) continue;
      used.add(v);
      insertKey(v, true);
      n++;
    }
    lastMsg = 'Inserted 10 random keys.';
    render();
  }

  // ------------------------------------------------ B-tree insert (preemptive split)
  function insertKey(k, quiet = false) {
    if (allKeys(tree).includes(k)) { lastMsg = `${k} is already in the tree.`; return; }
    let splits = 0;
    if (tree.keys.length === ORDER - 1) {
      const s = makeNode(false);
      s.children.push(tree);
      splitChild(s, 0);
      tree = s;
      splits++;
    }
    let node = tree;
    const path = new Set([node.id]);
    while (!node.leaf) {
      let i = node.keys.findIndex((x) => k < x);
      if (i < 0) i = node.keys.length;
      if (node.children[i].keys.length === ORDER - 1) {
        splitChild(node, i);
        splits++;
        if (k > node.keys[i]) i++;
      }
      node = node.children[i];
      path.add(node.id);
    }
    node.keys.push(k);
    node.keys.sort((a, b) => a - b);
    highlight = { nodes: path, key: k };
    if (!quiet) lastMsg = splits
      ? `Inserted ${k} — caused ${splits} split${splits > 1 ? 's' : ''}. The tree stays balanced: every leaf is at the same depth.`
      : `Inserted ${k} into a leaf with room. No splits needed.`;
  }

  function splitChild(parent, i) {
    const child = parent.children[i];
    const mid = Math.floor((ORDER - 1) / 2);
    const right = makeNode(child.leaf);
    right.keys = child.keys.splice(mid + 1);
    const up = child.keys.pop(); // middle key moves up
    if (!child.leaf) right.children = child.children.splice(mid + 1);
    parent.keys.splice(i, 0, up);
    parent.children.splice(i + 1, 0, right);
  }

  function searchKey(k) {
    let node = tree;
    const path = new Set();
    let reads = 0;
    for (;;) {
      path.add(node.id);
      reads++;
      if (node.keys.includes(k)) {
        highlight = { nodes: path, key: k };
        lastMsg = `Found ${k} in ${reads} node read${reads > 1 ? 's' : ''}. Each node is one page IO.`;
        return;
      }
      if (node.leaf) {
        highlight = { nodes: path, key: null };
        lastMsg = `${k} is not in the tree (${reads} node reads to prove it).`;
        return;
      }
      let i = node.keys.findIndex((x) => k < x);
      if (i < 0) i = node.keys.length;
      node = node.children[i];
    }
  }

  function allKeys(n) {
    return n ? [...n.keys, ...n.children.flatMap(allKeys)] : [];
  }

  // ------------------------------------------------ SVG rendering
  function render() {
    msg.textContent = lastMsg;
    const levels = [];
    (function walk(n, d) {
      (levels[d] ||= []).push(n);
      n.children.forEach((c) => walk(c, d + 1));
    })(tree, 0);

    const KW = 26, PAD = 8, H = 34, VGAP = 64;
    const nodeW = (n) => Math.max(1, n.keys.length) * KW + PAD * 2;

    // layout leaves left-to-right, parents centered over children
    const pos = new Map();
    let x = 10;
    (function layout(n, d) {
      if (n.leaf || !n.children.length) {
        pos.set(n.id, { x, y: d * VGAP + 10, n });
        x += nodeW(n) + 14;
        return;
      }
      n.children.forEach((c) => layout(c, d + 1));
      const first = pos.get(n.children[0].id);
      const last = pos.get(n.children[n.children.length - 1].id);
      const cx = (first.x + last.x + nodeW(n.children[n.children.length - 1])) / 2;
      pos.set(n.id, { x: cx - nodeW(n) / 2, y: d * VGAP + 10, n });
    })(tree, 0);

    const width = Math.max(x + 10, 320);
    const height = levels.length * VGAP + H + 10;
    let out = '';
    // edges
    for (const { x: px, y: py, n } of pos.values()) {
      n.children.forEach((c) => {
        const cp = pos.get(c.id);
        out += `<path d="M${px + nodeW(n) / 2},${py + H} C${px + nodeW(n) / 2},${py + H + 24} ${cp.x + nodeW(c) / 2},${cp.y - 20} ${cp.x + nodeW(c) / 2},${cp.y}" class="bt-edge"/>`;
      });
    }
    // nodes
    for (const { x: px, y: py, n } of pos.values()) {
      const hot = highlight.nodes.has(n.id);
      out += `<g class="bt-node${hot ? ' hot' : ''}">`;
      out += `<rect x="${px}" y="${py}" width="${nodeW(n)}" height="${H}" rx="8"/>`;
      n.keys.forEach((k, i) => {
        const kx = px + PAD + i * KW + KW / 2;
        const isKey = highlight.key === k && hot;
        out += `<text x="${kx}" y="${py + H / 2 + 4}" class="bt-key${isKey ? ' found' : ''}">${k}</text>`;
        if (i) out += `<line x1="${px + PAD + i * KW}" y1="${py + 6}" x2="${px + PAD + i * KW}" y2="${py + H - 6}" class="bt-sep"/>`;
      });
      if (!n.keys.length) out += `<text x="${px + nodeW(n) / 2}" y="${py + H / 2 + 4}" class="bt-key">·</text>`;
      out += '</g>';
    }
    svgWrap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px">${out}</svg>`;
  }

  render();
}
