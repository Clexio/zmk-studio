/** @type {import('tailwindcss').Config} */
import trac from "tailwindcss-react-aria-components";
import contQueries from "@tailwindcss/container-queries";

export default {
  content: ["./index.html", "./download.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    fontSize: {
      xs: "0.75rem",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui"],
      },
      colors: {
        // Brand colors extracted from the KeyPlayer logo (logo.png):
        // deep blue #2b59a7 is the primary accent; amber #f5b51c and
        // red #de2b2d are reserved for warning/error semantics.
        primary: "light-dark(#2b59a7, #6f9be0)",
        "primary-content": "light-dark(#ffffff, #0d1b33)",
        secondary: "light-dark(#2b59a7, #6f9be0)",
        accent: "light-dark(#2b59a7, #6f9be0)",
        "base-content": "light-dark(#1f2937, #A6ADBB)",
        "base-100": "light-dark(oklch(100% 0 0), #1d232a)",
        "base-200": "light-dark(#F2F2F2, #191e24)",
        "base-300": "light-dark(#E5E6E6, #15191e)",
      },
    },

    fontFamily: {
      keycap: ["Inter", "system-ui"],
    },
  },
  plugins: [contQueries, trac({ prefix: "rac" })],
};
