export const NAV_POSITION_KEY = "mt-nav-position";

/** Runs in <head> before first paint so a forced right-side rail doesn't flash at the bottom first. */
export const NAV_POSITION_SCRIPT = `try{var p=localStorage.getItem("${NAV_POSITION_KEY}");if(p==="side"||p==="bottom")document.documentElement.classList.add("nav-"+p)}catch(e){}`;