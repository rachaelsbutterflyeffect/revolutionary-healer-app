import "./globals.css";

export const metadata = {
  title: "The Revolutionary Healer",
  description: "Rachael's healing methodology, on demand, for healers and practitioners.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/bg.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
