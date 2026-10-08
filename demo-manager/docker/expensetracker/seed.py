#!/usr/bin/env python3
"""Generate a realistic year of Expense Tracker data, ending today.

Runs at container start so the demo always has a full current month, a
complete twelve-month history for the charts, and something to show on every
screen: recurring bills, subscriptions, budgets, savings goals, a car loan with
its payments, tags, a refund and a couple of anomalies worth flagging.

The persona is a young professional renting in Pretoria: salary on the 25th,
rent on the 1st, a financed car, a gym habit and a December holiday.

Usage: seed.py <profile-dir>
"""
import calendar
import os
import random
import sys
import uuid
from datetime import date, timedelta

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.expenseTracker/profiles/Default')
TODAY = date.today()
rng = random.Random(TODAY.year * 100 + TODAY.month)  # varies month to month, stable within one


def months_back(n):
    """First day of the month n months before the current one."""
    y, m = TODAY.year, TODAY.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


START = months_back(11)          # twelve months including this one


def day(d, dom):
    """d's month at day-of-month dom, clamped to the month length."""
    return d.replace(day=min(dom, calendar.monthrange(d.year, d.month)[1]))


def csv(v):
    v = str(v)
    return '"' + v.replace('"', '""') + '"' if (',' in v or '"' in v) else v


def money(x):
    return f'{round(x, 2):.2f}'


CATEGORIES = [
    'Rent', 'Groceries', 'Transport', 'Utilities', 'Eating Out', 'Subscriptions',
    'Health', 'Insurance', 'Shopping', 'Personal Care', 'Entertainment', 'Gifts',
    'Travel', 'Education', 'Car Finance', 'Income',
]
BUDGETS = {
    'Rent': 7800, 'Groceries': 3200, 'Transport': 2600, 'Utilities': 2100,
    'Eating Out': 1600, 'Subscriptions': 450, 'Health': 2500, 'Insurance': 1000,
    'Shopping': 1500, 'Personal Care': 400, 'Entertainment': 600, 'Gifts': 500,
    'Car Finance': 4100,
}
TAGS = ['Essential', 'Work', 'Holiday', 'Treat', 'Car']

lines = []          # expenses.txt rows


def recurring(amount, cat, start, desc, freq='MONTHLY', income=False, tags=()):
    flags = ''
    if income:
        flags += ',INCOME'
    if tags:
        flags += ',' + csv('TAGS:' + '|'.join(tags))
    flags += ',ID:' + uuid.uuid4().hex[:12]
    lines.append(f'{money(amount)},{csv(cat)},{start.isoformat()},{csv(desc)},RECURRING,{freq},{flags}')


def spend(amount, cat, d, desc, income=False, refund=False, tags=()):
    if d > TODAY or d < START:
        return
    flags = ''
    if income:
        flags += ',INCOME'
    if refund:
        flags += ',REFUND'
    if tags:
        flags += ',' + csv('TAGS:' + '|'.join(tags))
    lines.append(f'{money(amount)},{csv(cat)},{d.isoformat()},{csv(desc)},REGULAR,{flags}')


# ---- Recurring: income, bills and subscriptions -------------------------
SALARY = 38000.00
recurring(SALARY, 'Income', day(START, 25), 'Salary', income=True, tags=['Work'])
recurring(7800.00, 'Rent', day(START, 1), 'Rent, Hatfield apartment', tags=['Essential'])
recurring(699.00, 'Utilities', day(START, 3), 'Vumatel fibre 100 Mbps', tags=['Essential'])
recurring(399.00, 'Utilities', day(START, 5), 'Vodacom contract')
recurring(1850.00, 'Health', day(START, 1), 'Discovery medical aid', tags=['Essential'])
recurring(549.00, 'Health', day(START, 2), 'Virgin Active gym')
recurring(920.00, 'Insurance', day(START, 1), 'Car insurance (OUTsurance)', tags=['Car'])
recurring(199.00, 'Subscriptions', day(START, 8), 'Netflix Standard')
recurring(69.99, 'Subscriptions', day(START, 12), 'Spotify Premium')
recurring(99.00, 'Subscriptions', day(START, 16), 'Showmax')
recurring(79.00, 'Subscriptions', day(START, 20), 'iCloud+ 200 GB')
recurring(4091.89, 'Car Finance', day(START, 28), 'WesBank car finance', tags=['Car'])

# ---- Day-to-day spending, month by month --------------------------------
GROCERS = ['Checkers Hatfield', 'Woolworths Food', 'Pick n Pay', 'Spar Brooklyn']
EATING = ['Uber Eats', 'Mr D Food', 'Ocean Basket', 'Nando\'s', 'Kauai', 'Spur', 'Doppio Zero']
COFFEE = ['Seattle Coffee Co.', 'Vida e Caffè', 'Bootlegger Coffee']
FUEL = ['Engen Lynnwood', 'Shell Menlyn', 'BP Hatfield', 'Sasol Garsfontein']
SHOPS = ['Takealot', 'Mr Price', 'Woolworths Clothing', 'Cotton On', 'Incredible Connection']
CARE = ['Clicks', 'Dis-Chem']
FUN = ['Ster-Kinekor', 'Steam', 'Loftus rugby tickets', 'Bowling at Menlyn', 'Comedy night']

m = START
while m <= TODAY:
    is_dec = m.month == 12
    # Groceries: a weekly shop plus a few top-ups
    for wk in range(5):
        d = m + timedelta(days=wk * 7 + rng.randint(0, 2))
        if d.month == m.month:
            spend(rng.uniform(380, 760), 'Groceries', d, rng.choice(GROCERS), tags=['Essential'])
    for _ in range(rng.randint(2, 4)):
        spend(rng.uniform(60, 240), 'Groceries', day(m, rng.randint(1, 28)), rng.choice(GROCERS))

    # Fuel every ten days or so, plus tolls and the odd Uber
    for k in range(3):
        spend(rng.uniform(650, 920), 'Transport', day(m, 3 + k * 10 + rng.randint(0, 3)), rng.choice(FUEL), tags=['Car'])
    for _ in range(rng.randint(1, 3)):
        spend(rng.uniform(85, 210), 'Transport', day(m, rng.randint(1, 28)), 'Uber trip')
    spend(rng.uniform(140, 260), 'Transport', day(m, rng.randint(1, 28)), 'Gautrain card top-up')

    # Prepaid electricity and water, higher in winter
    winter = m.month in (5, 6, 7, 8)
    spend(rng.uniform(780, 980) if winter else rng.uniform(520, 700), 'Utilities', day(m, rng.randint(1, 6)), 'City of Tshwane prepaid electricity', tags=['Essential'])
    spend(rng.uniform(210, 290), 'Utilities', day(m, rng.randint(7, 12)), 'City of Tshwane water and refuse')

    # Eating out and coffee
    for _ in range(rng.randint(4, 7) + (3 if is_dec else 0)):
        spend(rng.uniform(85, 340), 'Eating Out', day(m, rng.randint(1, 28)), rng.choice(EATING), tags=['Treat'] if rng.random() < 0.3 else ())
    for _ in range(rng.randint(4, 7)):
        spend(rng.uniform(38, 72), 'Eating Out', day(m, rng.randint(1, 28)), rng.choice(COFFEE))
    if rng.random() < 0.5:
        spend(rng.uniform(260, 520), 'Eating Out', day(m, rng.randint(1, 28)), 'Team lunch', tags=['Work'])

    # Personal care and pharmacy
    spend(rng.uniform(140, 380), 'Personal Care', day(m, rng.randint(1, 28)), rng.choice(CARE))
    if rng.random() < 0.6:
        spend(rng.uniform(180, 260), 'Personal Care', day(m, rng.randint(1, 28)), 'Haircut')
    if rng.random() < 0.35:
        spend(rng.uniform(220, 640), 'Health', day(m, rng.randint(1, 28)), 'Dis-Chem pharmacy script')

    # Shopping and fun
    for _ in range(rng.randint(1, 3)):
        spend(rng.uniform(180, 950), 'Shopping', day(m, rng.randint(1, 28)), rng.choice(SHOPS))
    for _ in range(rng.randint(1, 3)):
        spend(rng.uniform(90, 380), 'Entertainment', day(m, rng.randint(1, 28)), rng.choice(FUN))

    # Occasional freelance income
    if rng.random() < 0.3:
        spend(rng.choice([2500, 3200, 4500]), 'Income', day(m, rng.randint(10, 20)), 'Freelance website project', income=True, tags=['Work'])

    # Seasonal and one-off events
    if m.month == 12:
        spend(4280, 'Travel', day(m, 14), 'FlySafair JNB to CPT return', tags=['Holiday'])
        spend(6900, 'Travel', day(m, 18), 'Airbnb, Muizenberg (5 nights)', tags=['Holiday'])
        spend(rng.uniform(1800, 2600), 'Gifts', day(m, 20), 'Christmas presents', tags=['Holiday'])
        spend(SALARY * 0.9, 'Income', day(m, 15), 'Annual bonus', income=True, tags=['Work'])
    if m.month == 1:
        spend(2450, 'Education', day(m, 10), 'AWS Certified Developer exam', tags=['Work'])
    if m.month in (3, 9):
        spend(rng.uniform(3200, 4100), 'Transport', day(m, 17), 'Car service (Toyota Menlyn)', tags=['Car'])
    if m.month in (4, 8, 11):
        spend(rng.uniform(350, 700), 'Gifts', day(m, rng.randint(5, 25)), 'Birthday gift')
    if m.month == 6:
        spend(2899, 'Shopping', day(m, 12), 'Takealot: noise-cancelling headphones')
        spend(2899, 'Shopping', day(m, 19), 'Takealot return: headphones', refund=True)
    if m.month == 7:
        spend(1299, 'Education', day(m, 6), 'Udemy course bundle', tags=['Work'])

    nm = m.month + 1
    m = date(m.year + (nm > 12), (nm - 1) % 12 + 1, 1)

# An unusually large purchase this month so the anomaly alert has something to show
spend(5499, 'Shopping', day(TODAY.replace(day=1), max(1, min(TODAY.day, 6))), 'Incredible Connection: monitor upgrade')

# ---- Savings goals and contributions ------------------------------------
goals, contributions = [], []
ef = uuid.uuid4().hex[:12]
hol = uuid.uuid4().hex[:12]
goals.append(f'{ef},Emergency fund,60000.0,{date(TODAY.year + 1, 6, 30).isoformat()},2500.0,{START.isoformat()}')
goals.append(f'{hol},Mauritius 2027,28000.0,{date(TODAY.year + 1, 3, 31).isoformat()},2000.0,{months_back(6).isoformat()}')
m = START
while m <= TODAY:
    if day(m, 26) <= TODAY:
        contributions.append(f'{ef},{money(2500)},{day(m, 26).isoformat()},Monthly transfer')
        if m >= months_back(6):
            contributions.append(f'{hol},{money(2000)},{day(m, 26).isoformat()},Holiday fund')
    nm = m.month + 1
    m = date(m.year + (nm > 12), (nm - 1) % 12 + 1, 1)

# ---- Car loan: started 20 months ago, payments for every month since --------
debts, payments = [], []
car = uuid.uuid4().hex[:12]
loan_start = months_back(19)
debts.append(f'{car},Toyota Corolla Cross finance,185000.0,11.75,60,{day(loan_start, 28).isoformat()},MONTHLY,4091.89,ZAR,WesBank')
d = day(loan_start, 28)
while d <= TODAY:
    payments.append(f'{car},{money(4091.89)},{d.isoformat()},Debit order')
    nm = d.month + 1
    d = day(date(d.year + (nm > 12), (nm - 1) % 12 + 1, 1), 28)

# ---- Write -----------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)


def write(name, rows):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(rows) + ('\n' if rows else ''))


write('expenses.txt', lines)
write('categories.txt', [csv(c) for c in CATEGORIES])
write('budgets.txt', [f'{csv(k)},{float(v)}' for k, v in BUDGETS.items()])
write('tags.txt', TAGS)
write('goals.txt', goals)
write('goal_contributions.txt', contributions)
write('debts.txt', debts)
write('debt_payments.txt', payments)
write('settings.txt', ['baseCurrency=ZAR', f'recurringIncome={SALARY}'])

root = os.path.dirname(os.path.dirname(OUT))
with open(os.path.join(root, 'active_profile.txt'), 'w', encoding='utf-8') as f:
    f.write('Default\n')

print(f'seeded {len(lines)} transactions from {START} to {TODAY} into {OUT}')
