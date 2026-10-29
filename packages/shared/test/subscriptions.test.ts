import { describe, expect, it } from 'vitest';
import {
  addPeriod,
  billDue,
  calendarEvents,
  markBillPaid,
  cancelHelp,
  cashflow,
  emlToText,
  emptySnapshot,
  findRecurring,
  matchExisting,
  parseEmailList,
  parseDateText,
  parseEmails,
  parseStatement,
  parseStatementText,
  rollForward,
  readEmailRefs,
  withEmailRefs,
  emailSearch,
  subscriptionAlerts,
  subscriptionToBill,
  billToSubscription,
  subscriptionSummary,
  upcomingBills,
  type Subscription,
} from '../src';

const TODAY = '2026-10-29';

const sub = (p: Partial<Subscription>): Subscription =>
  ({
    id: p.name ?? 'x',
    household_id: 'h',
    created_at: '',
    updated_at: '',
    deleted: false,
    name: '',
    service: '',
    category: 'other',
    amount: 10,
    frequency: 'monthly',
    next_due: null,
    status: 'active',
    source: 'manual',
    payer_id: null,
    account_email: '',
    pay_method: '',
    cancel_url: '',
    remind: true,
    last_charged: null,
    cancelled_on: null,
    notes: '',
    ...p,
  }) as Subscription;

describe('dates', () => {
  it('reads common date formats', () => {
    expect(parseDateText('November 15, 2026')).toBe('2026-11-15');
    expect(parseDateText('Nov 3', 2026)).toBe('2026-11-03');
    expect(parseDateText('due 11/05/26')).toBe('2026-11-05');
    expect(parseDateText('2026-12-01')).toBe('2026-12-01');
    expect(parseDateText('15 Dec 2026')).toBe('2026-12-15');
    expect(parseDateText('Thu, 15 Oct 2026 10:00:00 GMT')).toBe('2026-10-15');
  });
  it('adds billing periods and rolls past dates forward', () => {
    expect(addPeriod('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addPeriod('2026-03-10', 'yearly')).toBe('2027-03-10');
    expect(rollForward('2026-08-05', 'monthly', TODAY)).toBe('2026-11-05');
  });
});

describe('emails', () => {
  const emails = `From: Netflix <info@account.netflix.com>
Subject: Your Netflix membership
Date: Oct 12, 2026

Your Standard plan will renew on November 12, 2026 for $15.49/month.
Charged to Visa ending in 4821.

-----Original Message-----
From: "Spotify" <no-reply@spotify.com>
Subject: Your Spotify Premium receipt
Date: October 3, 2026

Premium Family  $19.99
Your next billing date is November 3, 2026.

-----Original Message-----
From: Atmos Energy <billing@atmosenergy.com>
Subject: Your bill is ready
Date: Oct 20, 2026

Amount due: $48.12
Payment due date: November 9, 2026
Account ending in 7731

-----Original Message-----
From: Zen Yoga Studio <hello@zenyoga.example>
Subject: Your membership receipt
Date: Oct 1, 2026

Thanks for your payment of $39.00. Your plan renews monthly.`;

  it('finds subscriptions and bills, with prices and due dates', () => {
    const r = parseEmails(emails, TODAY);
    expect(r.scanned).toBe(4);
    const netflix = r.subscriptions.find((s) => s.service === 'netflix')!;
    expect(netflix).toMatchObject({ amount: 15.49, next_due: '2026-11-12', category: 'entertainment', confidence: 'sure', pay_method: 'Visa ••4821' });
    expect(netflix.cancel_url).toContain('netflix.com');
    expect(r.subscriptions.find((s) => s.service === 'spotify')).toMatchObject({ amount: 19.99, next_due: '2026-11-03', category: 'music' });
    const yoga = r.subscriptions.find((s) => /zen/i.test(s.name))!;
    expect(yoga.amount).toBe(39);
    const atmos = r.bills[0]!;
    expect(atmos).toMatchObject({ amount: 48.12, next_due: '2026-11-09', category: 'utilities', account: 'Ending in 7731' });
  });

  it('decodes raw .eml files', () => {
    const raw = 'From: Hulu <hulu@hulumail.com>\r\nSubject: Hulu receipt\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Total: $9=2E99</p><p>Next billing date: Dec 2, 2026</p>';
    const text = emlToText(raw);
    expect(text).toContain('$9.99');
    const r = parseEmails(text, TODAY);
    expect(r.subscriptions[0]).toMatchObject({ service: 'hulu', amount: 9.99, next_due: '2026-12-02' });
  });

  it('marks cancellation emails as cancelled', () => {
    const r = parseEmails('From: Peacock <no-reply@peacocktv.com>\nSubject: Your subscription has been cancelled\n\nWe are sorry to see you go. Your Peacock Premium ($7.99/month) has been cancelled.', TODAY);
    expect(r.subscriptions[0]!.status).toBe('cancelled');
  });
});

describe('bank statements', () => {
  const statement = `Chase Freedom Statement  Opening/Closing Date 09/15/26 - 10/14/26
08/16 NETFLIX.COM 866-579-7172 CA 15.49
08/20 PLANET FITNESS CLUB FEES 24.99
08/22 HEB GROCERY #123 GEORGETOWN TX 142.17
09/16 NETFLIX.COM 866-579-7172 CA 15.49
09/18 SPOTIFY USA 19.99
09/20 PLANET FITNESS CLUB FEES 24.99
09/21 SPOTIFY P2A9F 19.99
09/25 AUSTIN COOKING CLUB 29.00
09/30 PAYMENT THANK YOU -800.00
10/02 ATMOS ENERGY AUTOPAY 48.12
10/16 NETFLIX.COM 866-579-7172 CA 15.49
10/20 PLANET FITNESS CLUB FEES 24.99
10/25 AUSTIN COOKING CLUB 29.00
10/26 APPLE.COM/BILL 866-712-7753 2.99`;

  it('reads transactions and skips payments', () => {
    const tx = parseStatementText(statement, TODAY);
    expect(tx.length).toBe(13);
    expect(tx[0]).toEqual({ date: '2026-08-16', description: 'NETFLIX.COM 866-579-7172 CA', amount: 15.49 });
    expect(tx.some((t) => /PAYMENT/.test(t.description))).toBe(false);
  });

  it('finds known and unknown recurring charges, double charges and bills', () => {
    const r = parseStatement(statement, TODAY);
    const netflix = r.subscriptions.find((s) => s.service === 'netflix')!;
    expect(netflix).toMatchObject({ amount: 15.49, last_charged: '2026-10-16', next_due: '2026-11-16', confidence: 'sure' });
    expect(netflix.charges.length).toBe(3);
    expect(r.subscriptions.find((s) => s.service === 'spotify')!.doubleCharged).toBe(true);
    expect(r.subscriptions.find((s) => s.service === 'planet_fitness')!.category).toBe('fitness');
    const cooking = r.subscriptions.find((s) => /austin cooking/i.test(s.name))!;
    expect(cooking).toMatchObject({ confidence: 'unsure', status: 'confirm', amount: 29 });
    expect(r.subscriptions.some((s) => /heb/i.test(s.name))).toBe(false);
    expect(r.bills[0]).toMatchObject({ category: 'utilities', amount: 48.12 });
  });

  it('reads CSV exports', () => {
    const csv = 'Date,Description,Amount\n"10/05/2026","HULU 877-8244858 CA","-17.99"\n"09/05/2026","HULU 877-8244858 CA","-17.99"';
    const r = findRecurring(parseStatementText(csv, TODAY), TODAY);
    expect(r.subscriptions[0]).toMatchObject({ service: 'hulu', amount: 17.99, next_due: '2026-11-05' });
  });

  it('matches what is already saved so importing updates instead of duplicating', () => {
    const r = matchExisting(parseStatement(statement, TODAY), [sub({ id: 'n1', name: 'Netflix', service: 'netflix' })], []);
    expect(r.subscriptions.find((s) => s.service === 'netflix')!.existingId).toBe('n1');
  });
});

describe('money and calendar', () => {
  it('adds subscriptions to the monthly budget, drops cancelling ones after the move', () => {
    const subs = [sub({ id: 'a', amount: 15 }), sub({ id: 'b', amount: 120, frequency: 'yearly', status: 'cancelling' }), sub({ id: 'c', amount: 50, status: 'confirm' })];
    expect(cashflow({ subscriptions: subs }, 'now').byCategory).toEqual([{ category: 'subscriptions', monthly: 25 }]);
    expect(cashflow({ subscriptions: subs }, 'after').bills).toBe(15);
  });

  it('uses exact next due dates for bills of any frequency', () => {
    const bill = { id: 'b1', name: 'Car insurance', frequency: 'quarterly', next_due: '2026-08-15', status: 'active', deleted: false } as never;
    expect(upcomingBills([bill], TODAY, 'now', 10)).toEqual([]);
    expect(upcomingBills([bill], TODAY, 'now', 31)[0]!.date).toBe('2026-11-15');
  });

  it('puts renewals on the calendar when reminders are on', () => {
    const db = { ...emptySnapshot(), subscriptions: [sub({ id: 'n', name: 'Netflix', next_due: '2026-11-12', amount: 15.49 }), sub({ id: 'q', name: 'Quiet', next_due: '2026-11-12', remind: false })] };
    const ev = calendarEvents(db, { from: '2026-11-01', to: '2026-12-31' }).filter((e) => e.id.startsWith('sub-'));
    expect(ev.map((e) => e.date)).toEqual(['2026-11-12', '2026-12-12']);
    expect(ev[0]!.title).toBe('Netflix renews · $15.49');
  });
});

describe('totals, alerts and cancelling', () => {
  const subs = [
    sub({ id: 'a', name: 'Netflix', service: 'netflix', amount: 15.49 }),
    sub({ id: 'b', name: 'Hulu', service: 'hulu', amount: 9.99 }),
    sub({ id: 'c', name: 'Max (HBO)', service: 'max', amount: 16.99 }),
    sub({ id: 'd', name: 'Netflix', service: 'netflix', amount: 7.99 }),
    sub({ id: 'e', name: 'Adobe Creative Cloud', service: 'adobe', amount: 239.88, frequency: 'yearly', category: 'design_tools' }),
    sub({ id: 'f', name: 'Old gym', status: 'cancelled', amount: 30 }),
    sub({ id: 'g', name: 'Peacock', service: 'peacock', status: 'free_trial', amount: 7.99, next_due: '2026-11-01' }),
  ];

  it('totals monthly and yearly cost', () => {
    const s = subscriptionSummary(subs);
    expect(s.count).toBe(5);
    expect(s.monthly).toBeCloseTo(15.49 + 9.99 + 16.99 + 7.99 + 19.99, 2);
    expect(s.yearly).toBeCloseTo(s.monthly * 12, 2);
    expect(s.savedYearly).toBe(360);
    expect(s.trials).toBe(1);
  });

  it('warns about duplicates, overlaps and ending trials', () => {
    const alerts = subscriptionAlerts(subs, TODAY);
    expect(alerts.find((a) => a.kind === 'duplicate')!.title).toContain('Netflix');
    expect(alerts.find((a) => a.kind === 'overlap')!.title).toContain('video streaming');
    expect(alerts.find((a) => a.kind === 'trial')!.title).toContain('3 days');
  });

  it('points Apple-billed subscriptions to Apple and writes a cancel email', () => {
    const h = cancelHelp({ name: 'Disney+', service: 'disney_plus', cancel_url: '', pay_method: 'Apple', account_email: 'jess@example.com' });
    expect(h.url).toContain('apple.com');
    expect(h.email.body).toContain('jess@example.com');
    expect(cancelHelp({ name: 'Netflix', service: 'netflix', cancel_url: '', pay_method: '', account_email: '' }).url).toContain('netflix.com');
  });
});

describe('bill due dates', () => {
  it('flags an unpaid past due date as overdue unless on autopay', () => {
    expect(billDue({ next_due: '2026-10-20', due_day: null, frequency: 'monthly', autopay: false }, '2026-10-25')).toEqual({ date: '2026-10-20', daysAway: -5, overdue: true });
    expect(billDue({ next_due: '2026-10-20', due_day: null, frequency: 'monthly', autopay: true }, '2026-10-25')).toEqual({ date: '2026-11-20', daysAway: 26, overdue: false });
    expect(billDue({ next_due: null, due_day: 5, frequency: 'monthly', autopay: false }, '2026-10-25')?.date).toBe('2026-11-05');
  });

  it('moves the due date forward one period when paid', () => {
    expect(markBillPaid({ next_due: '2026-10-20', due_day: null, frequency: 'monthly', autopay: false }, '2026-10-25')).toEqual({ last_paid: '2026-10-25', next_due: '2026-11-20' });
    expect(markBillPaid({ next_due: '2026-11-01', due_day: null, frequency: 'quarterly', autopay: false }, '2026-10-25').next_due).toBe('2027-02-01');
    // Due the 20th, paid on the 25th: that's October's bill, so next is November 20.
    expect(markBillPaid({ next_due: null, due_day: 20, frequency: 'monthly', autopay: false }, '2026-10-25').next_due).toBe('2026-11-20');
    // Due the 5th, paid early on Oct 25: covers Nov 5, next is Dec 5.
    expect(markBillPaid({ next_due: null, due_day: 5, frequency: 'monthly', autopay: false }, '2026-10-25').next_due).toBe('2026-12-05');
  });
});
describe('parseEmailList (connected inbox)', () => {
  const netflix = 'From: Netflix <info@account.netflix.com>\nSubject: Your Netflix receipt\nDate: Oct 3, 2026\n\nYour Standard plan $17.99 was charged. Next billing date: November 3, 2026';
  const promo = 'From: Some Shop <deals@shop.com>\nSubject: Upgrade to a premium subscription!\nDate: Oct 4, 2026\n\nJoin our subscription club today and save.';
  const unsureReceipt = 'From: Acme Cloud <billing@acme.io>\nSubject: Payment received\nDate: Oct 5, 2026\n\nThanks for your payment. Your subscription total: $9.00 billed monthly.';
  it('keeps known services and real receipts, skips newsletters', () => {
    const r = parseEmailList([netflix, promo, unsureReceipt], '2026-10-29');
    const names = r.subscriptions.map((s) => s.name);
    expect(names.some((n) => /netflix/i.test(n))).toBe(true);
    expect(names.some((n) => /shop/i.test(n))).toBe(false);
    expect(r.subscriptions.length).toBe(2);
    expect(r.scanned).toBe(3);
  });
});
describe('email source', () => {
  const mail = (date: string) => `From: "Netflix" <info@mailer.netflix.com>
To: jess@gmail.com
Subject: Your Netflix receipt
Date: ${date}

Your subscription renewed. Total $17.99. Next billing date Nov 30, 2026.`;

  it('remembers the emails a subscription came from and saves them in notes', () => {
    const r = parseEmailList([mail('Oct 1, 2026'), mail('Sep 1, 2026')], TODAY);
    const s = r.subscriptions[0]!;
    expect(s.emails).toHaveLength(2);
    expect(s.emails![0]).toMatchObject({ from: 'Netflix', address: 'info@mailer.netflix.com', subject: 'Your Netflix receipt', date: '2026-10-01' });

    const notes = withEmailRefs('Recognized Netflix email', s.emails!.map((e) => ({ ...e, inbox: 'jess@gmail.com' })));
    const back = readEmailRefs(notes);
    expect(back.rest).toBe('Recognized Netflix email');
    expect(back.refs).toEqual([
      { from: 'Netflix', address: 'info@mailer.netflix.com', subject: 'Your Netflix receipt', date: '2026-10-01', inbox: 'jess@gmail.com' },
      { from: 'Netflix', address: 'info@mailer.netflix.com', subject: 'Your Netflix receipt', date: '2026-09-01', inbox: 'jess@gmail.com' },
    ]);
    // Same emails again: notes stay the same; user text after the block is kept.
    expect(withEmailRefs(notes, back.refs)).toBe(notes);
    const edited = `${notes}\nShared with mom`;
    expect(readEmailRefs(edited).rest).toBe('Recognized Netflix email\nShared with mom');
    expect(emailSearch(back.refs[0]!)).toBe('from:info@mailer.netflix.com subject:"Your Netflix receipt"');
  });

  it('keeps only the newest three', () => {
    const refs = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].map((date) => ({ from: 'Hulu', address: '', subject: 'Receipt', date }));
    expect(readEmailRefs(withEmailRefs('', refs)).refs.map((r) => r.date)).toEqual(['2026-04-01', '2026-03-01', '2026-02-01']);
  });
});

describe('bills vs subscriptions, cancellations and sent mail', () => {
  const ME = 'jess@example.com';
  it('files GEICO policy renewals as bills, not subscriptions', () => {
    const r = parseEmailList(
      ['From: GEICO <noreply@geico.com>\nTo: jess@example.com\nSubject: Your policy renewal and premium\nDate: Mon, 5 Oct 2026 08:00:00 GMT\n\nYour auto policy renews soon. Premium amount due: $642.10 due by November 3, 2026.'],
      TODAY,
      true,
      ME,
    );
    expect(r.subscriptions).toHaveLength(0);
    expect(r.bills).toHaveLength(1);
    expect(r.bills[0]!.name).toBe('GEICO');
    expect(r.bills[0]!.category).toBe('insurance');
    expect(r.bills[0]!.amount).toBe(642.1);
  });

  it('marks a subscription cancelled from a cancellation email newer than the last receipt', () => {
    const r = parseEmailList(
      [
        'From: Hulu <billing@hulu.com>\nSubject: Your Hulu receipt\nDate: Thu, 3 Sep 2026 10:00:00 GMT\n\nYou were charged $17.99 for your monthly subscription.',
        'From: Hulu <account@hulu.com>\nSubject: Your subscription has been cancelled\nDate: Sat, 12 Sep 2026 10:00:00 GMT\n\nWe are sorry to see you go. Your subscription has been cancelled.',
      ],
      TODAY,
      true,
      ME,
    );
    const hulu = r.subscriptions.find((x) => x.name === 'Hulu')!;
    expect(hulu.status).toBe('cancelled');
    expect(hulu.cancelled_on).toBe('2026-09-12');
    expect(hulu.last_charged).toBe('2026-09-03');
  });

  it('treats a receipt after a cancellation as re-subscribed', () => {
    const r = parseEmailList(
      [
        'From: Hulu <account@hulu.com>\nSubject: Your subscription has been cancelled\nDate: Sat, 12 Sep 2026 10:00:00 GMT\n\nYour subscription has been cancelled.',
        'From: Hulu <billing@hulu.com>\nSubject: Your Hulu receipt\nDate: Sat, 10 Oct 2026 10:00:00 GMT\n\nYou were charged $17.99 for your monthly subscription.',
      ],
      TODAY,
      true,
      ME,
    );
    expect(r.subscriptions[0]!.status).toBe('active');
    expect(r.subscriptions[0]!.cancelled_on).toBeNull();
  });

  it('reads cancel requests the user sent, but not notes to family', () => {
    const r = parseEmailList(
      [
        'From: Jess <jess@example.com>\nTo: Planet Fitness <members@planetfitness.com>\nSubject: Please cancel my membership\nDate: Fri, 2 Oct 2026 10:00:00 GMT\n\nHi, please cancel my membership, we are moving.',
        'From: Jess <jess@example.com>\nTo: Mike <mike@gmail.com>\nSubject: cancel netflix?\nDate: Fri, 2 Oct 2026 11:00:00 GMT\n\nShould we cancel Netflix before the move?',
      ],
      TODAY,
      true,
      ME,
    );
    expect(r.subscriptions).toHaveLength(1);
    expect(r.subscriptions[0]!.status).toBe('cancelling');
    expect(r.subscriptions[0]!.sent).toBe(true);
  });

  it('asks to confirm subscriptions with no receipt for over two billing periods', () => {
    const r = parseEmailList(['From: Spotify <no-reply@spotify.com>\nSubject: Your Spotify receipt\nDate: Mon, 1 Jun 2026 10:00:00 GMT\n\nYou were charged $11.99 for Spotify Premium monthly.'], TODAY, true, ME);
    expect(r.subscriptions[0]!.stale).toBe(true);
    expect(r.subscriptions[0]!.status).toBe('confirm');
    expect(r.subscriptions[0]!.reason).toContain('still active');
  });

  it('converts between subscriptions and bills', () => {
    const b = subscriptionToBill(sub({ name: 'GEICO', category: 'finance', amount: 120, frequency: 'monthly', next_due: '2026-11-15', notes: 'x' }));
    expect(b.category).toBe('insurance');
    expect(b.due_day).toBe(15);
    expect(b.notes).toBe('x');
    const s = billToSubscription({ ...b, last_paid: null, name: 'Netflix', category: 'other', status: 'active' });
    expect(s.service).toBe('netflix');
    expect(s.category).toBe('entertainment');
  });
});