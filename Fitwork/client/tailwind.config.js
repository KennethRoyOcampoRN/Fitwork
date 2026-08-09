/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Clinic brand palette, admin-customizable from Admin > Settings >
        // Branding: every shade resolves through a CSS custom property (see
        // index.css) so changing --clinic-primary/--clinic-accent at
        // runtime re-themes every `clinic-*` utility class instantly, with
        // no rebuild. `clinic-600`/`700` are the accent (buttons/links);
        // `clinic-800`/`900` are the primary (header/nav) tones. The
        // defaults baked into index.css are the original navy (#1F3B57) +
        // teal (#2E6F8E) — used whenever no custom branding has been set.
        clinic: {
          50: "var(--clinic-50)",
          100: "var(--clinic-100)",
          200: "var(--clinic-200)",
          300: "var(--clinic-300)",
          400: "var(--clinic-400)",
          500: "var(--clinic-500)",
          600: "var(--clinic-accent)",
          700: "var(--clinic-700)",
          800: "var(--clinic-primary)",
          900: "var(--clinic-900)",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto",
          "Helvetica Neue", "Arial", "sans-serif",
        ],
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 350ms ease-out both",
      },
    },
  },
  plugins: [],
};
