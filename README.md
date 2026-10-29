# My Caregiver Circle

One shared plan for the family caring for a loved one.

- **Appointments**: date, time, place, doctor, and who's taking them.
- **Medicines**: the list as written on the labels (for keeping track only; never dosing advice).
- **To-dos**: shared tasks with who's doing it and due dates.
- **Emergency care card**: allergies, doctors, insurance, contacts; lists the medicines automatically.
- Invite family with a code or link. Everyone signs in with a free CashCow account. Changes show up for everyone within about 30 seconds.

Free: 1 circle with 2 people. Premium (through CashCow, $2.99/mo, $19.99/yr or $39.99 once):
up to 3 circles, up to 10 people each, and a printable care card. The organizer's Premium covers the whole circle.

Data lives in Supabase (`caregiver_circle.sql` in the CashCow- repo) and is reached only through
the CashCow server (`/api/care/*`), which checks membership on every request.
Rebrand in `brand.js`. Wording rule: helps families keep track; not medical advice.

## Render (Static Site)
- Build command: `npm install && npm run build`
- Publish directory: `dist`
