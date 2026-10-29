import { addPeriod, monthlyAmount } from './cashflow';
import type { Bill, Frequency, Subscription } from './types';
import { daysBetween } from './util';

/** A known subscription service. `group` drives the "you pay for two of these" overlap warning. */
export interface SubService {
  key: string;
  name: string;
  category: string;
  match: RegExp;
  group?: string;
  /** Where to cancel or manage it. */
  cancel?: string;
  /** Extra cancel tip (in-person only, by phone…). */
  how?: string;
  frequency?: Frequency;
}

const APPLE_SUBS = 'https://apps.apple.com/account/subscriptions';
const GOOGLE_SUBS = 'https://play.google.com/store/account/subscriptions';
const MS = 'https://account.microsoft.com/services';

const s = (key: string, name: string, category: string, match: RegExp, group?: string, cancel?: string, how?: string, frequency?: Frequency): SubService => ({ key, name, category, match, group, cancel, how, frequency });

/** Order matters: specific names (YouTube TV, Apple Music) before broad ones (YouTube, Apple). */
export const SUB_SERVICES: SubService[] = [
  // Video & entertainment
  s('netflix', 'Netflix', 'entertainment', /netflix/i, 'video', 'https://www.netflix.com/cancelplan'),
  s('hulu', 'Hulu', 'entertainment', /\bhulu\b/i, 'video', 'https://secure.hulu.com/account/cancel'),
  s('disney_plus', 'Disney+', 'entertainment', /disney\s?(\+|plus)|disneyplus/i, 'video', 'https://www.disneyplus.com/account/subscription'),
  s('espn_plus', 'ESPN+', 'entertainment', /espn\s?(\+|plus)/i, 'video', 'https://plus.espn.com/'),
  s('max', 'Max (HBO)', 'entertainment', /\bhbo\b|\bmax\.com|\bhbomax|\bmax\b.*(subscription|stream)/i, 'video', 'https://auth.max.com/subscription'),
  s('paramount_plus', 'Paramount+', 'entertainment', /paramount\s?(\+|plus)/i, 'video', 'https://www.paramountplus.com/account/'),
  s('peacock', 'Peacock', 'entertainment', /peacock/i, 'video', 'https://www.peacocktv.com/account/plans'),
  s('youtube_tv', 'YouTube TV', 'entertainment', /youtube\s?tv|google\s?\*?youtube\s?tv/i, 'live_tv', 'https://tv.youtube.com/settings/membership'),
  s('youtube_premium', 'YouTube Premium', 'entertainment', /youtube\s?(premium|music)|google\s?\*?youtube/i, 'video', 'https://www.youtube.com/paid_memberships'),
  s('sling', 'Sling TV', 'entertainment', /sling\s?tv|\bsling\.com/i, 'live_tv', 'https://www.sling.com/my-account'),
  s('fubo', 'Fubo', 'entertainment', /fubo/i, 'live_tv', 'https://www.fubo.tv/account'),
  s('philo', 'Philo', 'entertainment', /\bphilo\b/i, 'live_tv', 'https://www.philo.com/account'),
  s('apple_tv', 'Apple TV+', 'entertainment', /apple\s?tv/i, 'video', APPLE_SUBS),
  s('crunchyroll', 'Crunchyroll', 'entertainment', /crunchyroll/i, 'video', 'https://www.crunchyroll.com/account/membership'),
  s('starz', 'Starz', 'entertainment', /starz/i, 'video', 'https://www.starz.com/account'),
  s('amc_plus', 'AMC+', 'entertainment', /amc\s?(\+|plus)/i, 'video'),
  s('discovery_plus', 'Discovery+', 'entertainment', /discovery\s?(\+|plus)/i, 'video', 'https://www.discoveryplus.com/account'),
  s('britbox', 'BritBox', 'entertainment', /britbox/i, 'video'),
  s('mgm_plus', 'MGM+', 'entertainment', /mgm\s?(\+|plus)|epix/i, 'video'),
  s('twitch', 'Twitch', 'entertainment', /twitch/i, undefined, 'https://www.twitch.tv/subscriptions'),
  s('patreon', 'Patreon', 'entertainment', /patreon/i, undefined, 'https://www.patreon.com/settings/memberships'),
  s('siriusxm', 'SiriusXM', 'music', /sirius\s?xm|siriusxm/i, 'music', 'https://care.siriusxm.com/', 'SiriusXM usually makes you cancel by chat or phone (1-866-635-2349). Ask for written confirmation.'),
  // Music & audio
  s('spotify', 'Spotify', 'music', /spotify/i, 'music', 'https://www.spotify.com/account/subscription/'),
  s('apple_music', 'Apple Music', 'music', /apple\s?music/i, 'music', APPLE_SUBS),
  s('amazon_music', 'Amazon Music Unlimited', 'music', /amazon\s?music/i, 'music', 'https://www.amazon.com/music/settings'),
  s('pandora', 'Pandora', 'music', /pandora/i, 'music', 'https://www.pandora.com/settings/subscription'),
  s('tidal', 'Tidal', 'music', /\btidal\b/i, 'music'),
  s('audible', 'Audible', 'music', /audible/i, 'audiobooks', 'https://www.audible.com/account/overview'),
  // Gaming
  s('xbox', 'Xbox Game Pass', 'gaming', /xbox|game\s?pass/i, 'gaming', MS),
  s('playstation', 'PlayStation Plus', 'gaming', /playstation|\bpsn\b|sony\s?interactive/i, 'gaming', 'https://www.playstation.com/acct/management'),
  s('nintendo', 'Nintendo Switch Online', 'gaming', /nintendo/i, 'gaming', 'https://accounts.nintendo.com/'),
  s('ea_play', 'EA Play', 'gaming', /\bea\s?play\b|electronic\s?arts/i, 'gaming'),
  s('apple_arcade', 'Apple Arcade', 'gaming', /apple\s?arcade/i, 'gaming', APPLE_SUBS),
  // Design tools
  s('adobe', 'Adobe Creative Cloud', 'design_tools', /adobe/i, 'design', 'https://account.adobe.com/plans', 'Adobe charges an early-cancel fee on annual plans paid monthly — check the date on the plans page.'),
  s('canva', 'Canva Pro', 'design_tools', /canva/i, 'design', 'https://www.canva.com/settings/billing-and-teams'),
  s('figma', 'Figma', 'design_tools', /figma/i, 'design', 'https://www.figma.com/settings'),
  s('procreate', 'Procreate Dreams', 'design_tools', /procreate/i, 'design'),
  s('shutterstock', 'Shutterstock', 'design_tools', /shutterstock/i, 'stock', 'https://www.shutterstock.com/account/plans'),
  s('envato', 'Envato Elements', 'design_tools', /envato/i, 'stock', 'https://account.envato.com/'),
  s('squarespace', 'Squarespace', 'design_tools', /squarespace/i, 'website', 'https://account.squarespace.com/'),
  s('wix', 'Wix', 'design_tools', /\bwix\b|wix\.com/i, 'website', 'https://manage.wix.com/account/subscriptions'),
  s('godaddy', 'GoDaddy', 'design_tools', /godaddy|go\s?daddy/i, 'website', 'https://account.godaddy.com/products'),
  s('cricut', 'Cricut Access', 'design_tools', /cricut/i, 'design'),
  // Software & AI
  s('microsoft_365', 'Microsoft 365', 'software', /microsoft\s?365|office\s?365|msft\s?\*?(365|office)/i, 'office', MS),
  s('chatgpt', 'ChatGPT Plus', 'software', /chatgpt|openai/i, 'ai', 'https://chatgpt.com/#settings/Subscription'),
  s('claude', 'Claude Pro', 'software', /anthropic|claude\.ai/i, 'ai', 'https://claude.ai/settings/billing'),
  s('midjourney', 'Midjourney', 'software', /midjourney/i, 'ai', 'https://www.midjourney.com/account'),
  s('copilot', 'GitHub Copilot', 'software', /github/i, 'ai', 'https://github.com/settings/billing'),
  s('grammarly', 'Grammarly', 'software', /grammarly/i, undefined, 'https://account.grammarly.com/subscription'),
  s('notion', 'Notion', 'software', /notion\b|notion\.so/i, 'notes', 'https://www.notion.so/my-account'),
  s('evernote', 'Evernote', 'software', /evernote/i, 'notes'),
  s('zoom', 'Zoom', 'software', /\bzoom\.us|\bzoom\s?(video|pro|com)/i, undefined, 'https://zoom.us/account'),
  s('linkedin', 'LinkedIn Premium', 'software', /linkedin/i, undefined, 'https://www.linkedin.com/premium/manage'),
  s('1password', '1Password', 'security', /1password/i, 'passwords', 'https://my.1password.com/'),
  s('lastpass', 'LastPass', 'security', /lastpass/i, 'passwords'),
  s('nordvpn', 'NordVPN', 'security', /nord\s?vpn|nordsec/i, 'vpn', 'https://my.nordaccount.com/'),
  s('expressvpn', 'ExpressVPN', 'security', /express\s?vpn/i, 'vpn'),
  s('norton', 'Norton 360', 'security', /norton|lifelock|gen\s?digital/i, 'antivirus', 'https://my.norton.com/'),
  s('mcafee', 'McAfee', 'security', /mcafee/i, 'antivirus', 'https://home.mcafee.com/'),
  // Cloud storage
  s('icloud', 'iCloud+', 'cloud', /icloud/i, 'cloud', APPLE_SUBS),
  s('google_one', 'Google One', 'cloud', /google\s?\*?(one|storage)/i, 'cloud', 'https://one.google.com/settings'),
  s('dropbox', 'Dropbox', 'cloud', /dropbox/i, 'cloud', 'https://www.dropbox.com/account/plan'),
  s('apple_one', 'Apple One', 'cloud', /apple\s?one/i, 'cloud', APPLE_SUBS),
  // Finance
  s('ynab', 'YNAB', 'finance', /\bynab\b|you\s?need\s?a\s?budget/i, 'budgeting', 'https://app.ynab.com/settings/subscription'),
  s('monarch', 'Monarch Money', 'finance', /monarch\s?money/i, 'budgeting'),
  s('rocket_money', 'Rocket Money', 'finance', /rocket\s?money|truebill/i, 'budgeting'),
  s('quickbooks', 'QuickBooks', 'finance', /quickbooks|intuit\s?\*?qb/i, undefined, 'https://accounts.intuit.com/'),
  s('experian', 'Experian CreditWorks', 'finance', /experian/i, 'credit', 'https://usa.experian.com/member/account'),
  s('identity_guard', 'Identity theft protection', 'finance', /identity\s?guard|\baura\b|idshield|lifelock/i, 'credit'),
  s('cash_app', 'Cash App / Venmo fee', 'finance', /\bzzzzzz\b/i),
  // Fitness
  s('peloton', 'Peloton', 'fitness', /peloton/i, 'workout_app', 'https://members.onepeloton.com/preferences/subscriptions'),
  s('planet_fitness', 'Planet Fitness', 'fitness', /planet\s?fit/i, 'gym', undefined, 'Planet Fitness usually needs you to cancel in person at your home club or by certified letter. Since you are moving, ask about transferring to a Germantown club instead.'),
  s('la_fitness', 'LA Fitness', 'fitness', /la\s?fitness/i, 'gym', undefined, 'LA Fitness needs a cancellation form (online or mailed). Keep the confirmation.'),
  s('anytime_fitness', 'Anytime Fitness', 'fitness', /anytime\s?fit/i, 'gym'),
  s('orangetheory', 'Orangetheory', 'fitness', /orange\s?theory/i, 'gym'),
  s('crunch', 'Crunch Fitness', 'fitness', /crunch\s?fit/i, 'gym'),
  s('lifetime', 'Life Time', 'fitness', /life\s?time\s?(fitness|athletic)/i, 'gym'),
  s('ymca', 'YMCA', 'fitness', /\bymca\b/i, 'gym'),
  s('classpass', 'ClassPass', 'fitness', /classpass/i, 'gym', 'https://classpass.com/settings/membership'),
  s('strava', 'Strava', 'fitness', /strava/i, 'workout_app'),
  s('fitbod', 'Fitbod', 'fitness', /fitbod/i, 'workout_app'),
  s('beachbody', 'BODi / Beachbody', 'fitness', /beachbody|\bbodi\b/i, 'workout_app'),
  s('myfitnesspal', 'MyFitnessPal', 'fitness', /myfitnesspal/i, 'diet'),
  s('noom', 'Noom', 'health', /\bnoom\b/i, 'diet', 'https://www.noom.com/support/'),
  s('weight_watchers', 'WeightWatchers', 'health', /weight\s?watchers|\bww\s?international/i, 'diet'),
  s('calm', 'Calm', 'health', /\bcalm\.com|\bcalm\s?(app|premium)/i, 'meditation'),
  s('headspace', 'Headspace', 'health', /headspace/i, 'meditation'),
  s('hims', 'Hims / Hers', 'health', /\bhims\b|forhims|forhers/i),
  s('betterhelp', 'BetterHelp', 'health', /betterhelp/i, 'therapy'),
  // Food
  s('hellofresh', 'HelloFresh', 'food', /hello\s?fresh/i, 'meal_kit', 'https://www.hellofresh.com/account-settings/plan-settings'),
  s('factor', 'Factor', 'food', /factor\s?75|factor\s?meals|\bfactor_/i, 'meal_kit'),
  s('home_chef', 'Home Chef', 'food', /home\s?chef/i, 'meal_kit'),
  s('blue_apron', 'Blue Apron', 'food', /blue\s?apron/i, 'meal_kit'),
  s('green_chef', 'Green Chef', 'food', /green\s?chef/i, 'meal_kit'),
  s('everyplate', 'EveryPlate', 'food', /everyplate/i, 'meal_kit'),
  s('dashpass', 'DoorDash DashPass', 'food', /dashpass|doordash/i, 'delivery', 'https://www.doordash.com/dashpass/manage'),
  s('uber_one', 'Uber One', 'food', /uber\s?one/i, 'delivery', 'https://www.uber.com/uber-one'),
  s('grubhub_plus', 'Grubhub+', 'food', /grubhub/i, 'delivery'),
  s('instacart_plus', 'Instacart+', 'food', /instacart/i, 'delivery', 'https://www.instacart.com/store/account/instacart-plus'),
  s('starbucks', 'Coffee subscription', 'food', /\bpanera\s?(sip|unlimited)/i, undefined),
  // Shopping & memberships
  s('amazon_prime', 'Amazon Prime', 'shopping', /amazon\s?prime|prime\s?video|amzn\s?prime|prime\s?membership/i, 'shopping_club', 'https://www.amazon.com/mc/pipelines/cancellation'),
  s('kindle_unlimited', 'Kindle Unlimited', 'news', /kindle\s?unlimited|kindle\s?svcs/i, 'ebooks', 'https://www.amazon.com/kindle-dbs/ku/ku-central'),
  s('walmart_plus', 'Walmart+', 'shopping', /walmart\s?(\+|plus)/i, 'shopping_club', 'https://www.walmart.com/plus/account'),
  s('costco', 'Costco membership', 'shopping', /costco/i, 'warehouse', undefined, 'Costco memberships are refundable — cancel at any warehouse membership counter or call 1-800-774-2678.', 'yearly'),
  s('sams_club', "Sam's Club", 'shopping', /sam'?s\s?club/i, 'warehouse', undefined, undefined, 'yearly'),
  s('target_circle', 'Target Circle 360', 'shopping', /target\s?circle/i, 'shopping_club'),
  s('chewy', 'Chewy Autoship', 'pets', /chewy/i, 'pet_food', 'https://www.chewy.com/app/account/autoship'),
  s('barkbox', 'BarkBox', 'pets', /barkbox|bark\s?co/i, 'pet_box'),
  s('fabfitfun', 'FabFitFun', 'shopping', /fabfitfun/i, 'box'),
  s('ipsy', 'Ipsy', 'shopping', /\bipsy\b/i, 'box'),
  s('stitch_fix', 'Stitch Fix', 'shopping', /stitch\s?fix/i, 'box'),
  s('dollar_shave', 'Dollar Shave Club', 'shopping', /dollar\s?shave/i, 'razors'),
  // News & reading
  s('nytimes', 'New York Times', 'news', /new\s?york\s?times|nytimes|\bnyt\b/i, 'news', 'https://myaccount.nytimes.com/seg/subscription'),
  s('wsj', 'Wall Street Journal', 'news', /wall\s?street\s?journal|\bwsj\b|dow\s?jones/i, 'news'),
  s('washington_post', 'Washington Post', 'news', /washington\s?post|washpost/i, 'news'),
  s('athletic', 'The Athletic', 'news', /the\s?athletic/i, 'news'),
  s('scribd', 'Scribd / Everand', 'news', /scribd|everand/i, 'ebooks'),
  s('medium', 'Medium', 'news', /medium\.com|\bmedium\s?membership/i, 'news'),
  s('substack', 'Substack', 'news', /substack/i, 'news'),
  // Learning
  s('duolingo', 'Duolingo Super', 'education', /duolingo/i, 'language'),
  s('babbel', 'Babbel', 'education', /babbel/i, 'language'),
  s('rosetta', 'Rosetta Stone', 'education', /rosetta\s?stone/i, 'language'),
  s('masterclass', 'MasterClass', 'education', /masterclass/i, 'courses'),
  s('skillshare', 'Skillshare', 'education', /skillshare/i, 'courses'),
  s('coursera', 'Coursera Plus', 'education', /coursera/i, 'courses'),
  s('abcmouse', 'ABCmouse', 'kids', /abc\s?mouse/i, 'kids_learning'),
  s('khan', 'Kids learning app', 'kids', /\bhomer\s?learning|\bepic!?\s?books/i, 'kids_learning'),
  // Security & home
  s('ring', 'Ring Protect', 'security', /\bring\.com|\bring\s?(protect|plan)/i, 'home_security', 'https://account.ring.com/account/plan'),
  s('simplisafe', 'SimpliSafe', 'security', /simplisafe/i, 'home_security'),
  s('adt', 'ADT', 'security', /\badt\b/i, 'home_security', undefined, 'ADT contracts often have an early-termination fee — but moving is a common exception. Ask them to move the service to Tennessee instead.'),
  s('arlo', 'Arlo Secure', 'security', /\barlo\b/i, 'home_security'),
  s('nest_aware', 'Google Nest Aware', 'security', /nest\s?aware/i, 'home_security', 'https://home.google.com/'),
  // App stores (the actual service is behind them)
  s('apple', 'Apple subscription', 'other', /apple\.com\/bill|apple\s?services|itunes/i, 'app_store', APPLE_SUBS, 'Apple bills several subscriptions together. Open Settings → your name → Subscriptions on the iPhone to see and cancel each one.'),
  s('google_play', 'Google Play subscription', 'other', /google\s?\*?play/i, 'app_store', GOOGLE_SUBS),
];

export function findService(text: string): SubService | undefined {
  return SUB_SERVICES.find((x) => x.match.test(text));
}

export const serviceByKey = (key: string) => SUB_SERVICES.find((x) => x.key === key);

/** Bill-type payees found in statements and bill emails. */
interface Biller {
  name: string;
  category: string;
  match: RegExp;
}

const b = (name: string, category: string, match: RegExp): Biller => ({ name, category, match });

export const BILLERS: Biller[] = [
  b('Mortgage', 'housing', /mortgage|mr\.?\s?cooper|rocket\s?mtg|loan\s?depot|pennymac|freedom\s?mortgage|newrez|shellpoint/i),
  b('Rent', 'housing', /\brent\b|apartment|property\s?management|bilt\s?rent|rentcafe|appfolio|yardi|zillow\s?rent/i),
  b('HOA', 'housing', /\bhoa\b|homeowners?\s?assoc/i),
  b('Electric', 'utilities', /electric|energy|\bpower\b|pedernales|oncor|txu|reliant|austin\s?energy|georgetown\s?util|mlgw|tva|entergy|duke\s?energy|\bpec\b/i),
  b('Water', 'utilities', /\bwater\b|sewer|wastewater|chisholm\s?trail|jonah\s?water/i),
  b('Gas', 'utilities', /atmos|\bgas\s?(co|company|service|utility)|centerpoint|piedmont\s?natural|texas\s?gas/i),
  b('Trash', 'utilities', /waste\s?management|republic\s?services|\btrash\b|garbage|\bwm\s?\*/i),
  b('Phone', 'internet_phone', /verizon|at&t|\batt\b|t-mobile|tmobile|cricket|visible|mint\s?mobile|google\s?fi|boost\s?mobile|metro\s?by|us\s?cellular|consumer\s?cellular/i),
  b('Internet', 'internet_phone', /spectrum|xfinity|comcast|\bcox\b|frontier|centurylink|lumen|starlink|google\s?fiber|astound|grande|suddenlink|optimum|wow!?\s?internet/i),
  b('Insurance', 'insurance', /insurance|geico|state\s?farm|progressive|allstate|\busaa\b|liberty\s?mutual|farmers\s?ins|nationwide|travelers|lemonade|root\s?ins|erie\s?ins|aaa\s?ins|metlife|prudential|northwestern\s?mutual|massmutual/i),
  b('Car payment', 'transportation', /auto\s?(loan|pay|finance)|toyota\s?(financial|motor)|honda\s?(financial|fin)|ford\s?credit|gm\s?financial|ally\s?(auto|financial)|carmax\s?auto|tesla\s?(finance|motors)|nissan\s?(motor|finance)|hyundai\s?(capital|motor)|kia\s?(finance|motors)|santander\s?consumer|westlake/i),
  b('Credit card', 'debt', /credit\s?card|card\s?(services|payment)|capital\s?one|chase\s?(card|credit|epay)|discover\s?(card|bank|e-?payment)|amex|american\s?express|citi\s?(card|bank)|synchrony|barclays|wells\s?fargo\s?card|bank\s?of\s?america\s?(card|credit)/i),
  b('Student loan', 'debt', /student\s?loan|sallie\s?mae|navient|mohela|nelnet|aidvantage|great\s?lakes|edfinancial|dept\s?of\s?ed/i),
  b('Personal loan', 'debt', /sofi|lending\s?club|upstart|best\s?egg|avant|prosper\s?(funding|loan)|affirm|klarna|afterpay/i),
  b('Childcare', 'childcare', /daycare|childcare|kindercare|primrose|tuition|learning\s?center|brightwheel|procare/i),
  b('Medical', 'health', /medical|hospital|clinic|pharmacy|dental|orthodont|vision\s?care|baylor\s?scott|st\.?\s?david|ascension|cvs\s?pharm|walgreens\s?pharm/i),
];

export function findBiller(text: string): Biller | undefined {
  return BILLERS.find((x) => x.match.test(text));
}

// ---------- small parsers ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const validDate = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;

/** All dollar amounts in a string, in order. */
export function moneyIn(text: string): number[] {
  const out: number[] = [];
  const re = /(?:\$|USD\s?)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)/gi;
  for (const m of text.matchAll(re)) out.push(Number(m[1]!.replace(/,/g, '')));
  return out.filter((n) => Number.isFinite(n) && n > 0);
}

/** Parses "November 15, 2026", "Nov 15 2026", "15 Nov 2026", "11/15/2026", "11/15/26", "2026-11-15". */
export function parseDateText(text: string, fallbackYear?: number): string | null {
  let m = /(20\d{2})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m && validDate(+m[1]!, +m[2]!, +m[3]!)) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(text);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    if (validDate(y, +m[1]!, +m[2]!)) return iso(y, +m[1]!, +m[2]!);
  }
  m = /(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(text);
  if (m && fallbackYear && validDate(fallbackYear, +m[1]!, +m[2]!)) return iso(fallbackYear, +m[1]!, +m[2]!);
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})?/i.exec(text);
  if (m) {
    const y = m[3] ? +m[3] : fallbackYear;
    const mo = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
    if (y && validDate(y, mo, +m[2]!)) return iso(y, mo, +m[2]!);
  }
  m = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(20\d{2})?/i.exec(text);
  if (m) {
    const y = m[3] ? +m[3] : fallbackYear;
    const mo = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
    if (y && validDate(y, mo, +m[1]!)) return iso(y, mo, +m[1]!);
  }
  return null;
}

export function frequencyIn(text: string): Frequency | null {
  if (/\b(annual(ly)?|yearly|per\s?year|a\s?year|\/\s?(yr|year)|12[-\s]months?)\b/i.test(text)) return 'yearly';
  if (/\b(quarterly|every\s?3\s?months|per\s?quarter)\b/i.test(text)) return 'quarterly';
  if (/\b(weekly|per\s?week|\/\s?(wk|week))\b/i.test(text)) return 'weekly';
  if (/\b(monthly|per\s?month|a\s?month|\/\s?(mo|month))\b/i.test(text)) return 'monthly';
  return null;
}

// ---------- costs & alerts ----------

const LIVE: Subscription['status'][] = ['active', 'cancelling', 'free_trial', 'confirm'];
/** Subscriptions you're paying for right now (trials cost nothing yet, unsure ones aren't counted). */
export const isPaying = (x: Pick<Subscription, 'status' | 'deleted'>) => !x.deleted && (x.status === 'active' || x.status === 'cancelling');

export function subscriptionCost(x: Pick<Subscription, 'amount' | 'frequency'>): { monthly: number; yearly: number } {
  const monthly = monthlyAmount(x.amount, x.frequency);
  return { monthly, yearly: monthly * 12 };
}

export interface SubscriptionSummary {
  monthly: number;
  yearly: number;
  count: number;
  toConfirm: number;
  trials: number;
  byCategory: { category: string; monthly: number; count: number }[];
  /** Yearly money saved by what you've cancelled. */
  savedYearly: number;
}

export function subscriptionSummary(subs: Subscription[]): SubscriptionSummary {
  const paying = subs.filter(isPaying);
  const cats = new Map<string, { monthly: number; count: number }>();
  for (const x of paying) {
    const c = cats.get(x.category) ?? { monthly: 0, count: 0 };
    c.monthly += subscriptionCost(x).monthly;
    c.count++;
    cats.set(x.category, c);
  }
  const monthly = paying.reduce((a, x) => a + subscriptionCost(x).monthly, 0);
  return {
    monthly,
    yearly: monthly * 12,
    count: paying.length,
    toConfirm: subs.filter((x) => !x.deleted && x.status === 'confirm').length,
    trials: subs.filter((x) => !x.deleted && x.status === 'free_trial').length,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.monthly - a.monthly),
    savedYearly: subs.filter((x) => !x.deleted && x.status === 'cancelled').reduce((a, x) => a + subscriptionCost(x).yearly, 0),
  };
}

const GROUP_LABEL: Record<string, string> = {
  video: 'video streaming services',
  live_tv: 'live TV services',
  music: 'music services',
  audiobooks: 'audiobook services',
  gaming: 'game subscriptions',
  design: 'design tools',
  stock: 'stock-photo plans',
  website: 'website plans',
  office: 'office suites',
  ai: 'AI assistants',
  notes: 'notes apps',
  passwords: 'password managers',
  vpn: 'VPNs',
  antivirus: 'antivirus plans',
  cloud: 'cloud-storage plans',
  budgeting: 'budgeting apps',
  credit: 'credit / identity monitors',
  gym: 'gym memberships',
  workout_app: 'workout apps',
  diet: 'diet apps',
  meditation: 'meditation apps',
  meal_kit: 'meal kits',
  delivery: 'delivery memberships',
  shopping_club: 'shopping memberships',
  warehouse: 'warehouse clubs',
  ebooks: 'e-book plans',
  news: 'news subscriptions',
  language: 'language apps',
  courses: 'course sites',
  home_security: 'home-security plans',
  pet_food: 'pet autoships',
  box: 'subscription boxes',
};

export interface SubscriptionAlert {
  kind: 'duplicate' | 'overlap' | 'trial' | 'gym_move';
  title: string;
  detail: string;
  ids: string[];
  monthly: number;
}

const groupOf = (x: Pick<Subscription, 'service' | 'name'>) => serviceByKey(x.service)?.group ?? findService(x.name)?.group;
const normName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "You're paying for Netflix twice", "3 video streaming services", trials about to bill… */
export function subscriptionAlerts(subs: Subscription[], today: string): SubscriptionAlert[] {
  const live = subs.filter((x) => !x.deleted && LIVE.includes(x.status) && x.status !== 'confirm');
  const out: SubscriptionAlert[] = [];
  const byKey = new Map<string, Subscription[]>();
  for (const x of live) {
    const k = x.service || normName(x.name);
    byKey.set(k, [...(byKey.get(k) ?? []), x]);
  }
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const monthly = list.slice(1).reduce((a, x) => a + subscriptionCost(x).monthly, 0);
    out.push({
      kind: 'duplicate',
      title: `${list[0]!.name} shows up ${list.length} times`,
      detail: `You may be paying for it twice (two accounts, or both directly and through Apple/Amazon). Keeping one saves about ${Math.round(monthly * 12)} dollars a year.`,
      ids: list.map((x) => x.id),
      monthly,
    });
  }
  const byGroup = new Map<string, Subscription[]>();
  for (const x of live) {
    const g = groupOf(x);
    if (!g || g === 'app_store') continue;
    byGroup.set(g, [...(byGroup.get(g) ?? []), x]);
  }
  for (const [g, list] of byGroup) {
    const distinct = new Set(list.map((x) => x.service || normName(x.name)));
    const limit = g === 'video' ? 3 : 2;
    if (distinct.size < limit) continue;
    const monthly = list.reduce((a, x) => a + subscriptionCost(x).monthly, 0);
    out.push({
      kind: 'overlap',
      title: `${distinct.size} ${GROUP_LABEL[g] ?? 'similar subscriptions'}`,
      detail: `${list.map((x) => x.name).join(', ')} — ${Math.round(monthly)} dollars a month together. Could you rotate them or keep just one?`,
      ids: list.map((x) => x.id),
      monthly,
    });
  }
  for (const x of live) {
    if (x.status === 'free_trial' && x.next_due) {
      const days = daysBetween(today, x.next_due);
      if (days >= 0 && days <= 7)
        out.push({ kind: 'trial', title: `${x.name} trial ends ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`, detail: 'Cancel before then if you don’t want to be charged.', ids: [x.id], monthly: subscriptionCost(x).monthly });
    }
    if (groupOf(x) === 'gym' && x.status === 'active')
      out.push({ kind: 'gym_move', title: `${x.name} — you're moving`, detail: serviceByKey(x.service)?.how ?? 'Gyms often need notice in writing. Cancel or transfer before you leave Georgetown.', ids: [x.id], monthly: subscriptionCost(x).monthly });
  }
  return out;
}

// ---------- reading emails ----------

export interface FoundSubscription {
  /** Stable key used to merge charges from many emails / statements. */
  key: string;
  name: string;
  service: string;
  category: string;
  amount: number | null;
  frequency: Frequency;
  next_due: string | null;
  last_charged: string | null;
  status: Subscription['status'];
  cancel_url: string;
  pay_method: string;
  account_email: string;
  /** "sure" = known service or clearly a subscription; "unsure" = please confirm. */
  confidence: 'sure' | 'unsure';
  reason: string;
  charges: { date: string | null; amount: number; text: string }[];
  /** Same service charged twice in one billing period. */
  doubleCharged?: boolean;
  /** Matches an existing subscription (id) — import updates it instead of adding. */
  existingId?: string;
}

export interface FoundBill {
  key: string;
  name: string;
  category: string;
  amount: number | null;
  frequency: Frequency;
  next_due: string | null;
  due_day: number | null;
  autopay: boolean;
  account: string;
  website: string;
  reason: string;
  existingId?: string;
}

export interface ParseResult {
  subscriptions: FoundSubscription[];
  bills: FoundBill[];
  /** Lines that looked like transactions (statements) or emails read. */
  scanned: number;
}

const SUB_WORDS = /subscription|membership|renew|recurring|your\s?plan|billing\s?period|next\s?billing|auto-?renew|free\s?trial|monthly\s?plan|annual\s?plan|premium|plus\s?plan/i;
const BILL_WORDS = /amount\s?due|payment\s?due|due\s?date|minimum\s?payment|statement\s?balance|new\s?balance|total\s?due|balance\s?due|bill\s?is\s?ready|your\s?bill|e-?bill|autopay\s?scheduled|pay\s?by/i;

/** Splits pasted text into separate emails (forwarded / copied one after another). */
export function splitEmails(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n');
  const parts = t
    .split(/\n(?=\s*(?:-{3,}.*(?:forwarded|original).*-{3,}|from:\s.+\n(?:.*\n){0,3}?\s*(?:sent|date|subject|to):))/i)
    .flatMap((p) => p.split(/\n\s*(?:={5,}|-{5,}|_{5,})\s*\n/))
    .map((p) => p.replace(/^\s*-{3,}.*(?:forwarded|original).*-{3,}\s*$/gim, '').trim())
    .filter((p) => p.length > 20);
  return parts.length ? parts : [t];
}

/** Decodes a raw .eml (quoted-printable / base64, HTML) into plain text. */
export function emlToText(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');
  const headerEnd = text.indexOf('\n\n');
  const headers = headerEnd > 0 ? text.slice(0, headerEnd) : '';
  const keep = headers
    .split('\n')
    .filter((l) => /^(from|subject|date):/i.test(l))
    .join('\n');
  let body = headerEnd > 0 ? text.slice(headerEnd + 2) : text;
  // Pick the text/plain part if multipart, else text/html.
  const parts = body.split(/\n--[^\n]+\n/);
  const pick = parts.find((p) => /content-type:\s*text\/plain/i.test(p)) ?? parts.find((p) => /content-type:\s*text\/html/i.test(p)) ?? body;
  const partHeaderEnd = pick.indexOf('\n\n');
  const partHeaders = /content-type:/i.test(pick.slice(0, Math.max(0, partHeaderEnd))) ? pick.slice(0, partHeaderEnd) : '';
  body = partHeaders ? pick.slice(partHeaderEnd + 2) : pick;
  if (/content-transfer-encoding:\s*base64/i.test(partHeaders || headers)) {
    try {
      const bin = atob(body.replace(/[^A-Za-z0-9+/=]/g, ''));
      body = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      /* leave as is */
    }
  } else if (/quoted-printable/i.test(partHeaders || headers)) {
    body = body.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  }
  text = `${keep}\n\n${htmlToText(body)}`;
  return text.trim();
}

export function htmlToText(html: string): string {
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#36;|&dollar;/g, '$')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

function lineNear(text: string, re: RegExp): string | null {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? null : lines.slice(i, i + 2).join(' ');
}

function amountNear(text: string, re: RegExp): number | null {
  const line = lineNear(text, re);
  const n = line ? moneyIn(line)[0] : undefined;
  return n ?? null;
}

const yearOf = (text: string) => {
  const ys = [...text.matchAll(/\b(20[2-3]\d)\b/g)].map((m) => +m[1]!);
  return ys.length ? ys.sort((a, b) => ys.filter((y) => y === b).length - ys.filter((y) => y === a).length)[0] : undefined;
};

function senderName(text: string): string | null {
  const m = /^from:\s*"?([^"<\n]+?)"?\s*(?:<([^>\n]+)>)?\s*$/im.exec(text);
  if (m) {
    const name = m[1]!.trim();
    if (name && !/@/.test(name) && !/^(no-?reply|info|billing|support)$/i.test(name)) return name.replace(/\s*(billing|team|support|account(s)?|no-?reply)\s*$/i, '').trim();
    const dom = /@(?:[a-z0-9-]+\.)*([a-z0-9-]+)\.[a-z]+/i.exec(m[2] ?? name);
    if (dom) return dom[1]!.charAt(0).toUpperCase() + dom[1]!.slice(1);
  }
  return null;
}

const accountIn = (text: string) => /(?:account|acct)[^\n\d]{0,25}(?:ending\s?in|ending|#|number|no\.?)?\s*[:#]?\s*((?:x|\*|•)*\s?\d{4,})/i.exec(text)?.[1]?.replace(/[x*•\s]/gi, '').slice(-4);
const cardIn = (text: string) => {
  const m = /(visa|mastercard|master\s?card|amex|american\s?express|discover|debit\s?card|card)[^\n\d]{0,20}(?:ending\s?in|ending|•+|\*+|x+)\s*(\d{4})/i.exec(text);
  return m ? `${m[1]!.replace(/\s/g, ' ').replace(/^./, (c) => c.toUpperCase())} ••${m[2]}` : /paypal/i.test(text) ? 'PayPal' : '';
};
const emailIn = (text: string) => /^to:\s*.*?([\w.+-]+@[\w-]+\.[\w.]+)/im.exec(text)?.[1] ?? '';

/** Reads one email (receipt, renewal notice, bill) and returns what it describes. */
export function parseEmail(raw: string, today: string): { sub?: FoundSubscription; bill?: FoundBill } {
  const text = htmlToText(raw);
  const subject = /^subject:\s*(.+)$/im.exec(text)?.[1] ?? '';
  const fy = yearOf(text) ?? +today.slice(0, 4);
  const service = findService(`${subject}\n${senderName(text) ?? ''}`) ?? findService(text.slice(0, 1500));
  const biller = service ? undefined : findBiller(`${subject}\n${senderName(text) ?? ''}\n${text.slice(0, 800)}`);
  const isBill = !service && BILL_WORDS.test(text) && !SUB_WORDS.test(subject);

  if (isBill || (biller && !SUB_WORDS.test(text))) {
    const amount = amountNear(text, /amount\s?due|total\s?(amount\s?)?due|balance\s?due|new\s?balance|statement\s?balance|payment\s?amount|total\s?due|amount\s?of/i) ?? moneyIn(text)[0] ?? null;
    const dueLine = lineNear(text, /due\s?(date|by|on)|pay\s?by|payment\s?due|scheduled\s?(for|on)|will\s?be\s?(drafted|debited|paid)/i);
    const next_due = (dueLine && parseDateText(dueLine.replace(/^[^:]*?(due|by|on|for)\b/i, ''), fy)) ?? (dueLine && parseDateText(dueLine, fy)) ?? null;
    const name = biller && !/^(Rent|Mortgage|Electric|Water|Gas|Trash|Phone|Internet|Insurance|Credit card)$/.test(senderName(text) ?? '') ? (senderName(text) ?? biller.name) : (senderName(text) ?? biller?.name ?? (subject || 'Bill'));
    if (!amount && !next_due) return {};
    const freq = frequencyIn(text) ?? 'monthly';
    return {
      bill: {
        key: `bill:${normName(name)}`,
        name,
        category: biller?.category ?? findBiller(name)?.category ?? 'other',
        amount,
        frequency: freq === 'weekly' ? 'monthly' : freq,
        next_due,
        due_day: next_due ? +next_due.slice(8, 10) : null,
        autopay: /auto-?pay|automatic\s?payment|will\s?be\s?(drafted|debited)|scheduled\s?payment/i.test(text) && !/not\s?(enrolled|set\s?up)\s?(in|for)\s?auto/i.test(text),
        account: accountIn(text) ? `Ending in ${accountIn(text)}` : '',
        website: '',
        reason: 'From a bill email',
      },
    };
  }

  const cancelled = /(has\s?been|was|is\s?now)\s?(cancel+ed|ended)|cancel+ation\s?(confirm|complete)|sorry\s?to\s?see\s?you\s?go/i.test(text);
  const trial = /free\s?trial/i.test(text);
  const looksLikeSub = !!service || SUB_WORDS.test(text);
  if (!looksLikeSub) return {};
  const name = service?.name ?? (senderName(text) || subject.replace(/^(re|fwd?):\s*/i, '').slice(0, 40) || 'Subscription');
  const amount = amountNear(text, /total|charged|amount|price|billed|renew|plan|per\s?month|\/mo|subtotal/i) ?? moneyIn(text)[0] ?? null;
  const renewLine = lineNear(text, /next\s?(billing|payment|charge|renewal)|renew(s|al)?\s?(on|date)|will\s?(renew|be\s?charged|bill)|billing\s?date|trial\s?ends?|ends\s?on|until/i);
  const next_due = renewLine ? parseDateText(renewLine, fy) : null;
  const sentDate = /^(?:date|sent):\s*(.+)$/im.exec(text)?.[1];
  const charged = sentDate ? parseDateText(sentDate, fy) : null;
  const freq = frequencyIn(renewLine ?? '') ?? frequencyIn(text) ?? service?.frequency ?? 'monthly';
  const sure = !!service || (/subscription|membership/i.test(text) && amount != null);
  return {
    sub: {
      key: service ? service.key : `name:${normName(name)}`,
      name,
      service: service?.key ?? '',
      category: service?.category ?? guessSubCategory(text),
      amount,
      frequency: freq,
      next_due: next_due ?? (charged ? addPeriod(charged, freq) : null),
      last_charged: charged,
      status: cancelled ? 'cancelled' : trial && !amount ? 'free_trial' : sure ? 'active' : 'confirm',
      cancel_url: service?.cancel ?? '',
      pay_method: cardIn(text),
      account_email: emailIn(text),
      confidence: sure ? 'sure' : 'unsure',
      reason: service ? `Recognized ${service.name} email` : 'Email mentions a subscription — is this one?',
      charges: amount ? [{ date: charged, amount, text: subject || name }] : [],
    },
  };
}

function guessSubCategory(text: string): string {
  const t = text.toLowerCase();
  if (/stream|movie|tv\b|show|episode/.test(t)) return 'entertainment';
  if (/music|podcast|audio/.test(t)) return 'music';
  if (/gym|fitness|workout|yoga|class/.test(t)) return 'fitness';
  if (/meal|food|delivery|grocer/.test(t)) return 'food';
  if (/design|photo|template|font/.test(t)) return 'design_tools';
  if (/news|magazine|journal|digital\s?access/.test(t)) return 'news';
  if (/storage|cloud|backup/.test(t)) return 'cloud';
  if (/credit|bank|budget|invest|tax/.test(t)) return 'finance';
  if (/course|lesson|learn/.test(t)) return 'education';
  if (/app|software|pro\s?plan|license/.test(t)) return 'software';
  return 'other';
}

export function parseEmails(text: string, today: string): ParseResult {
  const emails = splitEmails(text);
  const subs: FoundSubscription[] = [];
  const bills: FoundBill[] = [];
  for (const e of emails) {
    const r = parseEmail(e, today);
    if (r.sub) subs.push(r.sub);
    if (r.bill) bills.push(r.bill);
  }
  return { subscriptions: mergeFound(subs), bills: mergeBills(bills), scanned: emails.length };
}

function mergeFound(list: FoundSubscription[]): FoundSubscription[] {
  const map = new Map<string, FoundSubscription>();
  for (const x of list) {
    const prev = map.get(x.key);
    if (!prev) {
      map.set(x.key, { ...x, charges: [...x.charges] });
      continue;
    }
    prev.charges.push(...x.charges);
    const newer = (x.last_charged ?? x.next_due ?? '') >= (prev.last_charged ?? prev.next_due ?? '');
    if (newer) {
      prev.amount = x.amount ?? prev.amount;
      prev.next_due = x.next_due ?? prev.next_due;
      prev.last_charged = x.last_charged ?? prev.last_charged;
      if (x.status === 'cancelled') prev.status = 'cancelled';
    }
    prev.pay_method ||= x.pay_method;
    prev.account_email ||= x.account_email;
    if (x.confidence === 'sure') {
      prev.confidence = 'sure';
      if (prev.status === 'confirm') prev.status = 'active';
    }
  }
  return [...map.values()];
}

function mergeBills(list: FoundBill[]): FoundBill[] {
  const map = new Map<string, FoundBill>();
  for (const x of list) {
    const prev = map.get(x.key);
    if (!prev || (x.next_due ?? '') >= (prev.next_due ?? '')) map.set(x.key, { ...prev, ...x, account: x.account || prev?.account || '' });
  }
  return [...map.values()];
}

// ---------- reading bank / card statements ----------

export interface Transaction {
  date: string;
  description: string;
  amount: number;
}

const SKIP_TX = /payment\s?(thank|received)|thank\s?you|deposit|payroll|direct\s?dep|transfer\s?(from|to)|interest\s?(paid|charge)|refund|credit\s?adj|beginning\s?balance|ending\s?balance|previous\s?balance|new\s?balance|total\s|subtotal|balance\s?forward|atm\s?(withdrawal|w\/d)|cash\s?withdrawal|zelle|venmo\s?cashout|check\s?#?\d+/i;

/** Pulls dated transactions out of statement text (PDF or CSV export). */
export function parseStatementText(text: string, today: string): Transaction[] {
  const t = text.replace(/\r\n?/g, '\n');
  const fy = yearOf(t) ?? +today.slice(0, 4);
  const lines = t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: Transaction[] = [];
  const dateRe = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s\d{1,2}(?:,?\s20\d{2})?)\b/i;
  const amtRe = /(-?\(?\$?\s?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?)(?:\s*(?:cr|dr))?$/i;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    // CSV: "10/05/2026","NETFLIX.COM","-15.49"
    if (/^"?\d{1,2}\/\d{1,2}\/\d{2,4}"?,|^"?\d{4}-\d{2}-\d{2}"?,/.test(line)) {
      const cells = line.match(/("([^"]*)"|[^,]+)/g)?.map((c) => c.replace(/^"|"$/g, '').trim()) ?? [];
      const date = parseDateText(cells[0]!, fy);
      const amtCell = [...cells].reverse().find((c, j) => j < 3 && /^-?\(?\$?-?\d[\d,]*\.\d{2}\)?$/.test(c));
      const desc = cells.slice(1).find((c) => /[a-z]{3}/i.test(c) && !/^-?\$?\d/.test(c));
      if (date && amtCell && desc) out.push({ date, description: desc, amount: Math.abs(Number(amtCell.replace(/[$,()]/g, ''))) });
      continue;
    }
    const dm = dateRe.exec(line);
    if (!dm) continue;
    // Some PDFs break a transaction over 2–3 lines; glue them until we see an amount.
    for (let j = 1; !amtRe.test(line) && j <= 2 && i + j < lines.length && !dateRe.test(lines[i + j]!); j++) line = `${line} ${lines[i + j]}`;
    const am = amtRe.exec(line);
    if (!am) continue;
    let desc = line.slice(dm[0].length, am.index).trim();
    // Drop a second (posting) date and trailing extra amounts.
    desc = desc.replace(dateRe, '').replace(/(-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\s*)+$/, '').trim();
    if (!/[a-z]{3}/i.test(desc) || SKIP_TX.test(desc)) continue;
    let date = parseDateText(dm[1]!, fy);
    if (!date) continue;
    // A December charge on a January statement belongs to last year.
    if (date > addPeriod(today, 'monthly')) date = `${+date.slice(0, 4) - 1}${date.slice(4)}`;
    const amount = Math.abs(Number(am[1]!.replace(/[$,()\s-]/g, '')));
    if (amount > 0 && amount < 20000) out.push({ date, description: desc, amount });
  }
  return out;
}

/** "NETFLIX.COM 866-579-7172 CA" → "netflix" so repeat charges group together. */
export function merchantKey(desc: string): string {
  const cleaned = desc
    .toLowerCase()
    .replace(/\b(pos|debit|credit|purchase|recurring|card|visa|mc|ach|online|pmt|payment|autopay|web|ppd|id|ref|des|indn|co|inc|llc|www|com|net|org|us|usa|help|bill|billing)\b/g, ' ')
    .replace(/https?:\/\/|\.com|\.net|\.co\b/g, ' ')
    .replace(/[0-9#*.,/\\:_-]+/g, ' ')
    .replace(/\b[a-z]{2}\b\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').filter((w) => w.length > 1).slice(0, 2).join(' ');
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Finds subscriptions (and regular bills) among statement transactions. */
export function findRecurring(txs: Transaction[], today: string): ParseResult {
  const subs = new Map<string, FoundSubscription>();
  const unknown = new Map<string, Transaction[]>();
  const billMap = new Map<string, { biller: Biller; txs: Transaction[] }>();
  for (const tx of txs) {
    const service = findService(tx.description);
    if (service) {
      const f = subs.get(service.key) ?? {
        key: service.key,
        name: service.name,
        service: service.key,
        category: service.category,
        amount: null,
        frequency: service.frequency ?? 'monthly',
        next_due: null,
        last_charged: null,
        status: 'active' as const,
        cancel_url: service.cancel ?? '',
        pay_method: /apple\.com|itunes/i.test(tx.description) && service.key !== 'apple' ? 'Apple' : /google\s?\*?play/i.test(tx.description) ? 'Google Play' : /paypal/i.test(tx.description) ? 'PayPal' : '',
        account_email: '',
        confidence: 'sure' as const,
        reason: `Recognized ${service.name} on your statement`,
        charges: [],
      };
      f.charges.push({ date: tx.date, amount: tx.amount, text: tx.description });
      subs.set(service.key, f);
      continue;
    }
    const biller = findBiller(tx.description);
    if (biller) {
      const k = `${biller.name}:${merchantKey(tx.description)}`;
      const e = billMap.get(k) ?? { biller, txs: [] };
      e.txs.push(tx);
      billMap.set(k, e);
      continue;
    }
    const k = merchantKey(tx.description);
    if (k) unknown.set(k, [...(unknown.get(k) ?? []), tx]);
  }

  // Unknown merchants: recurring at a steady price, or labelled as a subscription → ask.
  for (const [k, list] of unknown) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((x) => x.amount);
    const steady = Math.max(...amounts) - Math.min(...amounts) <= Math.max(1, Math.min(...amounts) * 0.15);
    const gaps = sorted.slice(1).map((x, i) => daysBetween(sorted[i]!.date, x.date));
    const monthlyGaps = gaps.length > 0 && gaps.every((g) => g >= 25 && g <= 35);
    const yearlyGap = gaps.length > 0 && gaps.every((g) => g >= 350 && g <= 380);
    const weeklyGaps = gaps.length > 1 && gaps.every((g) => g >= 6 && g <= 8);
    const labelled = sorted.some((x) => /subscr|membership|member\s?fee|monthly\s?fee|recurring|annual\s?fee|\bplan\b/i.test(x.description));
    if (!((steady && (monthlyGaps || yearlyGap || weeklyGaps)) || labelled)) continue;
    const last = sorted[sorted.length - 1]!;
    const freq: Frequency = yearlyGap ? 'yearly' : weeklyGaps ? 'weekly' : 'monthly';
    subs.set(`name:${k}`, {
      key: `name:${k}`,
      name: titleCase(k),
      service: '',
      category: guessSubCategory(last.description),
      amount: last.amount,
      frequency: freq,
      next_due: addPeriod(last.date, freq),
      last_charged: last.date,
      status: 'confirm',
      cancel_url: '',
      pay_method: '',
      account_email: '',
      confidence: 'unsure',
      reason: labelled ? `“${last.description}” looks like a membership` : `Charged ${sorted.length}× at about the same price, ${freq === 'yearly' ? 'a year' : freq === 'weekly' ? 'a week' : 'a month'} apart`,
      charges: sorted.map((x) => ({ date: x.date, amount: x.amount, text: x.description })),
    });
  }

  for (const f of subs.values()) {
    const sorted = [...f.charges].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    f.charges = sorted;
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    f.amount = last.amount;
    f.last_charged = last.date;
    const gaps = sorted.slice(1).map((x, i) => daysBetween(sorted[i]!.date!, x.date!));
    if (gaps.length && gaps.every((g) => g >= 350)) f.frequency = 'yearly';
    // Two charges of the same service within ~3 weeks: probably paying twice (unless it's the Apple / Google bundle).
    const close = gaps.some((g) => g < 20) && f.service !== 'apple' && f.service !== 'google_play';
    if (close) {
      const amts = new Set(sorted.map((x) => x.amount.toFixed(2)));
      f.doubleCharged = true;
      f.reason = amts.size > 1 ? `${f.name} charged ${sorted.length}× this period at different prices — two plans or two accounts?` : `${f.name} charged twice in the same month`;
    }
    if (last.date) f.next_due = addPeriod(last.date, f.frequency);
  }

  const bills: FoundBill[] = [];
  for (const { biller, txs: list } of billMap.values()) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1]!;
    const name = titleCase(merchantKey(last.description)) || biller.name;
    bills.push({
      key: `bill:${normName(name)}`,
      name: biller.name === 'Rent' || biller.name === 'Mortgage' ? biller.name : name,
      category: biller.category,
      amount: last.amount,
      frequency: 'monthly',
      next_due: addPeriod(last.date, 'monthly'),
      due_day: +last.date.slice(8, 10),
      autopay: /autopay|auto\s?pay|ach|ppd/i.test(last.description),
      account: '',
      website: '',
      reason: `${biller.name} payment on ${last.date}`,
    });
  }

  return { subscriptions: [...subs.values()], bills: mergeBills(bills), scanned: txs.length };
}

export function parseStatement(text: string, today: string): ParseResult {
  return findRecurring(parseStatementText(text, today), today);
}

/** Flags which found items already exist so the import updates them instead of adding duplicates. */
export function matchExisting(found: ParseResult, subs: Subscription[], bills: Bill[]): ParseResult {
  const live = subs.filter((x) => !x.deleted);
  const liveBills = bills.filter((x) => !x.deleted);
  return {
    ...found,
    subscriptions: found.subscriptions.map((f) => ({ ...f, existingId: live.find((x) => (f.service && x.service === f.service) || normName(x.name) === normName(f.name))?.id })),
    bills: found.bills.map((f) => ({ ...f, existingId: liveBills.find((x) => normName(x.name) === normName(f.name))?.id })),
  };
}

/** Cancel instructions for one subscription. */
export function cancelHelp(x: Pick<Subscription, 'name' | 'service' | 'cancel_url' | 'pay_method' | 'account_email'>): { url: string; steps: string[]; email: { subject: string; body: string } } {
  const svc = serviceByKey(x.service) ?? findService(x.name);
  const viaApple = /apple/i.test(x.pay_method);
  const viaGoogle = /google/i.test(x.pay_method);
  const url = viaApple ? APPLE_SUBS : viaGoogle ? GOOGLE_SUBS : x.cancel_url || svc?.cancel || '';
  const steps = [
    viaApple ? 'It bills through Apple: on the iPhone open Settings → your name → Subscriptions, tap it, then Cancel Subscription.' : viaGoogle ? 'It bills through Google Play: open Play Store → profile → Payments & subscriptions → Subscriptions.' : url ? 'Open the cancel page below and sign in to the account it bills.' : `Search “cancel ${x.name}” or check the last receipt email for a “manage subscription” link.`,
    ...(svc?.how ? [svc.how] : []),
    'Take a screenshot of the confirmation — or ask for it by email.',
    'Then come back and tap “It’s cancelled” so it drops out of your budget.',
    'If they keep charging after you cancel, your bank can block the merchant or dispute the charge.',
  ];
  const body = [
    'Hello,',
    '',
    `Please cancel my ${x.name} subscription effective immediately and stop all future charges.`,
    x.account_email ? `The account email is ${x.account_email}.` : 'My account email is: ____________',
    '',
    'Please reply by email to confirm the cancellation and the date of the final charge.',
    '',
    'Thank you',
  ].join('\n');
  return { url, steps, email: { subject: `Cancel my ${x.name} subscription`, body } };
}
