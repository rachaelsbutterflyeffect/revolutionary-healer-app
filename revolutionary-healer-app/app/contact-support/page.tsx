const GOLD = "#CFA646";
const BG = "#121110";
const CARD = "#1B1815";
const BORDER = "#3A342B";
const TEXT = "#F6F2E9";
const TEAL_SOFT = "#3FA8A3";

export default function ContactSupport() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div
          style={{
            fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
            fontSize: 22,
            letterSpacing: "0.04em",
            marginBottom: 22,
            textAlign: "center",
          }}
        >
          The Revolutionary<span style={{ color: GOLD }}> Healer</span>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 26 }}>
          <p style={{ color: TEXT, fontSize: 14, lineHeight: 1.6 }}>
            Locked out? Email me at{" "}
            <a href="mailto:rachaelsbutterflyeffect@gmail.com" style={{ color: TEAL_SOFT }}>
              rachaelsbutterflyeffect@gmail.com
            </a>{" "}
            and I'll get you back in.
          </p>
        </div>
      </div>
    </div>
  );
}
