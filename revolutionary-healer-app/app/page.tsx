import { Cinzel, Cormorant_Garamond, Cormorant_SC, Inter } from "next/font/google";
import SignInHome from "./SignInHome";

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

export default function Home() {
  const fonts = `${cinzel.variable} ${cormorant.variable} ${cormorantSc.variable} ${inter.variable}`;
  return <SignInHome fontsClassName={fonts} />;
}
