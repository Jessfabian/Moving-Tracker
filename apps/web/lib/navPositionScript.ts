export const NAV_POSITION_KEY = "mt-nav-position";

/** Runs in <head> before first paint so a forced right-side rail doesn't flash at the bottom first. */
export const NAV_POSITION_SCRIPT = `try{var p=localStorage.getItem("${NAV_POSITION_KEY}");if(p==="side"||p==="bottom")document.documentElement.classList.add("nav-"+p)}catch(e){}`;

/** Runs before first paint so a forced (or system) dark appearance never flashes light. */
export const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("mt:ui:theme")||'"auto"');var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}`;