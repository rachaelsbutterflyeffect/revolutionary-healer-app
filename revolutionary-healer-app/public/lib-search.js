// Activation library search. Matches the text the member can already see
// (title, description, what it's for, when to use) plus tags/keywords when
// a record has them. It does not add symptom-to-activation mappings.
(function () {
  var LABELS = {
    "All": "All",
    "Mind + Body": "Mind & Body",
    "Energy + Frequency": "Energy & Frequency",
    "Business + Impact": "Business & Impact",
    "Money + Receiving": "Money & Receiving",
    "Gifts + Spirit": "Gifts & Spirit"
  };

  function catLabel(cat) {
    return LABELS[cat] || cat;
  }

  // Plain plurals, and "dizzy" / "dizziness", hit the same existing copy.
  // This only folds the word the member typed. It does not add new claims.
  function queryHit(hay, q) {
    if (!q) return true;
    hay = String(hay || "").toLowerCase();
    q = String(q).toLowerCase();
    var forms = [q];
    if (q.length >= 4) forms.push(q + "s", q + "ness");
    if (q.length >= 4 && q.charAt(q.length - 1) === "y") forms.push(q.slice(0, -1) + "iness");
    if (q.length >= 8 && q.slice(-5) === "iness") forms.push(q.slice(0, -5) + "y");
    if (q.length >= 5 && q.charAt(q.length - 1) === "s") forms.push(q.slice(0, -1));
    if (q.length >= 8 && q.slice(-4) === "ness") forms.push(q.slice(0, -4));
    for (var i = 0; i < forms.length; i++) {
      if (forms[i] && hay.indexOf(forms[i]) !== -1) return true;
    }
    return false;
  }

  window.rhCatLabel = catLabel;
  window.rhQueryHit = queryHit;
})();
