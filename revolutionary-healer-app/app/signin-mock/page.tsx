import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, Cormorant_SC, Inter } from "next/font/google";
import SignInMock from "./SignInMock";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--sm-cinzel",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--sm-cormorant",
  display: "swap",
});

const cormorantSc = Cormorant_SC({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--sm-cormorant-sc",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--sm-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign in preview · The Revolutionary Healer",
  description: "Visual mock of the Revolutionary Healer sign-in page. It does not sign you in.",
  robots: { index: false, follow: false },
};

/**
 * Isolated visual mock at /signin-mock.
 * Does not replace /, does not call login, and does not change auth.
 */
export default function SignInMockPage() {
  const fonts = `${cinzel.variable} ${cormorant.variable} ${cormorantSc.variable} ${inter.variable}`;
  return <SignInMock fontsClassName={fonts} />;
}
