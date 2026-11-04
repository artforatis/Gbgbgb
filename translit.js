/* Bangla pronunciation (উচ্চারণ) from Uthmani Arabic. Works in the browser and in Node. */
(function (root) {
"use strict";
// Arabic (KFGQPC Uthmani Hafs, as in quran-cloud) -> Bangla-script pronunciation.
// Rule based: follows Uthmani marks for silent letters, madd, tanwin, idgham, iqlab,
// joins words in wasl and applies waqf (stop) at the end of each verse.

const FATHA = "َ", KASRA = "ِ", DAMMA = "ُ";
const FATHATAN = "ً", DAMMATAN = "ٌ", KASRATAN = "ٍ";
const O_FATHATAN = "ٗ", O_DAMMATAN = "ٞ", O_KASRATAN = "ٖ";
const SHADDA = "ّ", SUKUN = "ۡ", SILENT = "ْ", SILENT2 = "۠";
const SUP_ALEF = "ٰ", MADDAH = "ٓ", SMALL_WAW = "ۥ", SMALL_YEH = "ۦ";
const IQLAB_HI = "ۢ", IQLAB_LO = "ۭ", HAMZA_ABOVE = "ٔ", HAMZA_BELOW = "ٕ";
const TATWEEL = "ـ", WASLA = "ٱ";

const IGNORE = new Set(["ۚ","ۖ","ۗ","ۘ","ۛ","ۜ","۞","۩","۬","ٜ","ۨ","ۤ","ۧ"," "]);
const MARKS = new Set([FATHA,KASRA,DAMMA,FATHATAN,DAMMATAN,KASRATAN,O_FATHATAN,O_DAMMATAN,O_KASRATAN,SHADDA,SUKUN,SILENT,SILENT2,SUP_ALEF,MADDAH,SMALL_WAW,SMALL_YEH,IQLAB_HI,IQLAB_LO,HAMZA_ABOVE,HAMZA_BELOW]);

const CONS = {
  "ب":"ব","ت":"ত","ث":"ছ","ج":"জ","ح":"হ","خ":"খ","د":"দ","ذ":"য","ر":"র","ز":"য",
  "س":"স","ش":"শ","ص":"স","ض":"দ","ط":"ত","ظ":"য","غ":"গ","ف":"ফ","ق":"ক","ك":"ক",
  "ل":"ল","م":"ম","ن":"ন","ه":"হ","ة":"ত"
};
const HAMZAS = new Set(["ء","أ","إ","ئ","ؤ"]);
const SIGN = { a:"া", i:"ি", u:"ু", A:"া-", I:"ী", U:"ূ", "":"" };
const INDEP = { a:"আ", i:"ই", u:"উ", A:"আ-", I:"ঈ", U:"ঊ" };
const LONG = { a:"A", i:"I", u:"U" };
const SHORT = { A:"a", I:"i", U:"u" };

const LETTER_NAMES = { "ا":"আলিফ","ل":"লা-ম","م":"মী-ম","ص":"সোয়া-দ","ر":"রা","ك":"কা-ফ","ه":"হা","ي":"ইয়া",
  "ع":"‘আইন","ط":"ত্বা","س":"সী-ন","ح":"হা-","ق":"কা-ফ","ن":"নূ-ন" };

// split a word into units: {ch, marks:Set}
function units(word){
  const out = [];
  for (const c of word) {
    if (IGNORE.has(c)) continue;
    if (MARKS.has(c)) { if (out.length) out[out.length-1].m.add(c); continue; }
    out.push({ ch:c, m:new Set() });
  }
  return out;
}
const isIq = u => u.m.has(IQLAB_HI) || u.m.has(IQLAB_LO);
const rawV = u => u.m.has(FATHA) ? "a" : u.m.has(KASRA) ? "i" : u.m.has(DAMMA) ? "u" : "";
const vowelOf = u => (isIq(u) && rawV(u)) ? "" : u.m.has(FATHA) ? "a" : u.m.has(KASRA) ? "i" : u.m.has(DAMMA) ? "u" : "";
const tanwinOf = u => (isIq(u) && rawV(u)) ? rawV(u) :
  (u.m.has(FATHATAN) || u.m.has(O_FATHATAN)) ? "a" :
  (u.m.has(KASRATAN) || u.m.has(O_KASRATAN)) ? "i" :
  (u.m.has(DAMMATAN) || u.m.has(O_DAMMATAN)) ? "u" : "";
const hasAnyHaraka = u => vowelOf(u) || tanwinOf(u) || u.m.has(SUKUN) || u.m.has(SHADDA);

function isMuqattaat(us){
  return us.length > 0 && us.every(u => !vowelOf(u) && !tanwinOf(u) && !u.m.has(SUKUN) && !u.m.has(SHADDA) && !u.m.has(SUP_ALEF) && LETTER_NAMES[u.ch]);
}

// Token: {t:'cv', c:consonant-bangla or null, kind:'cons'|'y'|'w'|'ain'|'hamza', v, gem, lit}
function wordTokens(word, first){
  const us = units(word);
  if (isMuqattaat(us)) return { toks:[{ t:"lit", lit: us.map(u => LETTER_NAMES[u.ch]).join(" ") }], wasla:false, muq:true };
  const toks = [];
  let wasla = false, article = false;
  const last = () => toks[toks.length-1];
  const lastV = () => { for (let k = toks.length-1; k >= 0; k--) { if (toks[k].t === "cv") return toks[k]; if (toks[k].t === "lit") return null; } return null; };
  const lengthen = () => { const t = lastV(); if (t && LONG[t.v]) t.v = LONG[t.v]; };
  const allahAt = k => us[k] && us[k].ch === "ل" && us[k].m.has(SHADDA) && us[k].m.has(FATHA) && us[k+1] && us[k+1].ch === "ه" && k > 0 && us[k-1].ch === "ل";
  let isAllah = false;
  for (let k = 0; k < us.length; k++) if (allahAt(k)) isAllah = true;

  for (let k = 0; k < us.length; k++) {
    const u = us[k], ch = u.ch, nx = us[k+1];
    const v = vowelOf(u), tn = tanwinOf(u);
    const silent = u.m.has(SILENT) || u.m.has(SILENT2);
    if (silent) continue;

    if (ch === TATWEEL) {
      if (u.m.has(HAMZA_ABOVE)) { if (v) toks.push({ t:"cv", kind:"hamza", v }); else if (u.m.has(SUKUN)) toks.push({ t:"stop" }); }
      else if (u.m.has(SUP_ALEF)) lengthen();
      continue;
    }
    if (ch === WASLA) {
      if (k === 0) {
        wasla = true;
        article = !!(nx && nx.ch === "ل");
        if (first) { // starting a verse with hamzat wasl
          let sv = "i";
          if (nx && nx.ch === "ل") sv = "a";
          else { const third = us[k+2]; if (third && vowelOf(third) === "u") sv = "u"; }
          toks.push({ t:"cv", kind:"hamza", v:sv, start:true });
        }
      }
      continue;
    }

    if (ch === "آ") {
      const lv = lastV();
      if (k > 0 && lv && lv.v === "a") lengthen(); else toks.push({ t:"cv", kind:"hamza", v:"A" });
      continue;
    }
    if (ch === "ا") {
      if (u.m.has(HAMZA_ABOVE) || u.m.has(HAMZA_BELOW) || v) { toks.push({ t:"cv", kind:"hamza", v: v || (u.m.has(HAMZA_BELOW) ? "i" : "a") }); continue; }
      const lv = lastV();
      if (lv && lv.v === "a" && !last().tan) lengthen();
      continue; // otherwise silent (after tanwin etc.)
    }
    if (ch === "ى") {
      if (u.m.has(SUP_ALEF)) { lengthen(); continue; }
      const lv = lastV();
      if (v) { toks.push({ t:"cv", kind:"y", v }); continue; }
      if (lv && lv.v === "a" && !last().tan) lengthen();
      else if (lv && lv.v === "i") lengthen();
      continue;
    }
    if (HAMZAS.has(ch)) {
      if (u.m.has(SHADDA)) { toks.push({ t:"cv", kind:"hamza", v: v || "a", gem:true }); continue; }
      if (v) toks.push({ t:"cv", kind:"hamza", v });
      else if (tn) toks.push({ t:"cv", kind:"hamza", v:tn }, { t:"n", tan:true, iq: u.m.has(IQLAB_HI)||u.m.has(IQLAB_LO), u });
      else if (u.m.has(SUKUN)) toks.push({ t:"stop" });
      else if (u.m.has(MADDAH)) { /* hamza carrier with madd only */ toks.push({ t:"cv", kind:"hamza", v:"a" }); }
      if (u.m.has(SUP_ALEF)) lengthen();
      if (tn) last().tan = true;
      continue;
    }
    if (ch === "و" || ch === "ي") {
      const kind = ch === "و" ? "w" : "y";
      const lv = lastV();
      if (u.m.has(SHADDA)) {
        toks.push({ t:"cv", kind, v: v || tn || "", gem:true });
        if (tn) toks.push({ t:"n", tan:true, iq:u.m.has(IQLAB_HI)||u.m.has(IQLAB_LO), u });
        continue;
      }
      if (v || tn) {
        toks.push({ t:"cv", kind, v: v || tn });
        if (tn) toks.push({ t:"n", tan:true, iq:u.m.has(IQLAB_HI)||u.m.has(IQLAB_LO), u });
        if (u.m.has(SUP_ALEF)) lengthen();
        if (u.m.has(SMALL_WAW) || u.m.has(SMALL_YEH)) lengthen();
        continue;
      }
      if (u.m.has(SUKUN)) { // diphthong or consonant with sukun
        toks.push({ t:"dip", lit: kind === "w" ? "ও" : "ই" });
        continue;
      }
      // no mark: madd letter
      if (lv && ((kind === "w" && lv.v === "u") || (kind === "y" && lv.v === "i"))) { lengthen(); continue; }
      if (u.m.has(SUP_ALEF)) { lengthen(); continue; }
      // otherwise silent
      continue;
    }

    // ordinary consonants (incl. ع)
    const kind = ch === "ع" ? "ain" : "cons";
    const c = kind === "ain" ? "‘" : CONS[ch];
    if (!c) continue;
    if (u.m.has(SHADDA)) {
      const vv = v || tn || "";
      const tk = { t:"cv", kind, c, v:vv, gem:true };
      toks.push(tk);
      if (vv === "a" && allahAt(k)) tk.v = "A";
      if (tn) toks.push({ t:"n", tan:true, iq:u.m.has(IQLAB_HI)||u.m.has(IQLAB_LO), u });
    } else if (v || tn) {
      toks.push({ t:"cv", kind, c, v: v || tn, ta: ch === "ة" });
      if (tn) toks.push({ t:"n", tan:true, iq:u.m.has(IQLAB_HI)||u.m.has(IQLAB_LO), u });
    } else if (u.m.has(SUKUN)) {
      toks.push({ t:"cv", kind, c, v:"" });
    } else {
      // no haraka at all: assimilated (idgham), ikhfa, iqlab, or sun letter lam
      const nextGem = nx && nx.m.has(SHADDA);
      if (ch === "ن" && u.m.has(IQLAB_HI)) toks.push({ t:"cv", kind, c:"ম", v:"" });
      else if (nextGem) { /* idgham: silent */ }
      else if (ch === "ن" && nx && (nx.ch === "ي" || nx.ch === "و")) toks.push({ t:"lit", lit:"ঁ" });
      else if (ch === "ل" && k > 0 && us[k-1].ch === WASLA) { /* sun letter */ }
      else toks.push({ t:"cv", kind, c, v:"" });
    }
    if (u.m.has(SUP_ALEF)) lengthen();
    if (u.m.has(SMALL_WAW) || u.m.has(SMALL_YEH)) lengthen();
  }
  return { toks, wasla, article, isAllah };
}

function render(toks){
  let s = "";
  let prevVowel = false;
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    if (t.start && toks[ti+1] && toks[ti+1].gem && toks[ti+1].kind === "cons" && toks[ti+1].c !== "ল") {
      s += INDEP[t.v] + toks[ti+1].c + " "; toks[ti+1].noGem = true; prevVowel = false; continue;
    }
    if (t.t === "lit") { s += t.lit; prevVowel = false; continue; }
    if (t.t === "dip") { s += t.lit; prevVowel = true; continue; }
    if (t.t === "stop") { s += "’"; prevVowel = false; continue; }
    if (t.t === "n") { s += t.iq ? "ম" : t.drop ? "" : t.nasal ? "ঁ" : "ন"; prevVowel = false; continue; }
    const v = t.v;
    if (t.kind === "hamza") {
      if (t.gem) s += "’";
      s += v ? INDEP[v] : "’"; prevVowel = !!v; continue;
    }
    if (t.kind === "ain") {
      s += "‘" + (v ? INDEP[v] : ""); prevVowel = !!v; continue;
    }
    if (t.kind === "y") {
      if (!v) { s += "ই"; prevVowel = true; continue; }
      if ((v === "u" || v === "U") && !(t.gem && !t.noGem)) { s += "ইউ"; prevVowel = true; continue; }
      const base = t.gem && !t.noGem ? "য়্য" : "য়";
      s += (prevVowel ? "" : "ই") + base + SIGN[v]; prevVowel = true; continue;
    }
    if (t.kind === "w") {
      if (!v) { s += "ও"; prevVowel = true; continue; }
      if (v === "u" || v === "U") { s += (t.gem && !t.noGem ? "উ" : "") + INDEP[v]; prevVowel = true; continue; }
      s += (t.gem && !t.noGem && prevVowel ? "ও" : "") + "ওয়" + SIGN[v]; prevVowel = true; continue;
    }
    const c = t.gem && !t.noGem ? t.c + "্" + t.c : t.c;
    s += c + SIGN[v]; prevVowel = !!v;
  }
  return s;
}

function translitVerse(text, opts){
  opts = opts || {};
  const words = text.split(/\s+/).filter(w => units(w).length);
  const W = words.map((w, i) => ({ ...wordTokens(w, i === 0), ar:w }));
  // tanwin / final nun before next word
  for (let i = 0; i < W.length; i++) {
    const cur = W[i], nxt = W[i+1];
    const lastTok = cur.toks[cur.toks.length-1];
    if (lastTok && lastTok.t === "n" && nxt) {
      const nu = units(nxt.ar)[0];
      if (nu && nu.ch === WASLA) { lastTok.lit = true; cur.toks.push({ t:"cv", kind:"cons", c:"", v:"i" }); }
      else if (nu && nu.m.has(SHADDA)) lastTok.drop = true;
      else if (nu && (nu.ch === "ي" || nu.ch === "و")) lastTok.nasal = true;
    } else if (lastTok && lastTok.t === "cv" && lastTok.kind === "cons" && lastTok.v === "" && nxt && !nxt.wasla) {
      const cu = units(cur.ar).filter(u => !(u.m.has(SILENT) || u.m.has(SILENT2)));
      const lu = cu[cu.length-1], nu = units(nxt.ar)[0];
      if (lu && !hasAnyHaraka(lu) && !lu.m.has(IQLAB_HI) && nu) {
        if (nu.m.has(SHADDA)) cur.toks.pop();
        else if (lu.ch === "ن" && (nu.ch === "ي" || nu.ch === "و")) { cur.toks.pop(); cur.toks.push({ t:"lit", lit:"ঁ" }); }
      }
    }
  }
  // waqf at verse end
  const L = W[W.length-1];
  if (L && !L.muq && !opts.noStop) {
    const tk = L.toks;
    let e = tk.length - 1;
    if (tk[e] && tk[e].t === "n") {
      const vt = tk[e-1];
      tk.pop(); e--;
      if (vt && vt.t === "cv" && vt.v === "a" && !vt.ta) vt.v = "A";
      else if (vt && vt.t === "cv") { vt.v = ""; if (vt.ta) vt.c = "হ"; }
    } else if (tk[e] && tk[e].t === "cv") {
      const vt = tk[e];
      if (vt.v === "a" || vt.v === "i" || vt.v === "u") {
        vt.v = ""; if (vt.ta) vt.c = "হ";
        if (vt.kind === "hamza") { vt.kind = "cons"; vt.c = "’"; }
      } else if (vt.v === "U" && vt.c === "হ") vt.v = "";
      else if (vt.v === "I" && vt.c === "হ") vt.v = "";
    }
  }
  // join words: wasl
  const out = [];
  for (let i = 0; i < W.length; i++) {
    const cur = W[i];
    const nxt = W[i+1];
    let carry = "";
    let glue = false;
    if (nxt && nxt.wasla && !nxt.isAllah && !nxt.article) {
      const lv = [...cur.toks].reverse().find(t => t.t === "cv");
      if (lv && lv === cur.toks[cur.toks.length-1] && SHORT[lv.v]) lv.v = SHORT[lv.v];
      glue = true;
    } else if (nxt && nxt.wasla && !nxt.isAllah) {
      // shorten long vowel at end of current word
      const lv = [...cur.toks].reverse().find(t => t.t === "cv");
      if (lv && lv === cur.toks[cur.toks.length-1] && SHORT[lv.v]) lv.v = SHORT[lv.v];
      // move first sukun consonant / first half of geminate of next word to current word
      const ft = nxt.toks[0];
      if (ft && ft.t === "cv" && ft.kind === "cons" && ft.v === "") { carry = ft.c; nxt.toks.shift(); }
      else if (ft && ft.t === "cv" && ft.gem && ft.kind === "cons") { carry = ft.c; ft.noGem = true; }
      else if (ft && ft.t === "cv" && ft.gem && ft.kind === "y") { carry = "ই"; ft.noGem = true; }
    } else if (nxt && !nxt.wasla && !nxt.muq) {
      const ft = nxt.toks[0];
      if (ft && ft.t === "cv" && ft.gem && ft.kind === "cons") { carry = ft.c; ft.noGem = true; }
    }
    if (nxt && nxt.wasla && nxt.isAllah) {
      const lv = [...cur.toks].reverse().find(t => t.t === "cv");
      if (lv && lv === cur.toks[cur.toks.length-1] && SHORT[lv.v]) lv.v = SHORT[lv.v];
    }
    let r = render(cur.toks) + carry;
    if (i > 0 && ((cur.isAllah && cur.wasla) || W[i-1].glue) && out.length) {
      out[out.length-1] += r; cur.glue = glue; continue;
    }
    cur.glue = glue;
    out.push(r);
  }
  // glue words where the carried consonant ended up starting the Allah word
  return out.join(" ").replace(/\s+/g, " ").replace(/ ’/g, "’").trim();
}

function translitWord(word){
  return translitVerse(word, { noStop:true });
}

const api = { translitVerse, translitWord };
if (typeof module !== "undefined" && module.exports) module.exports = api;
root.BNTranslit = api;
})(typeof window !== "undefined" ? window : globalThis);
