# Elite Gaming App — Full Replacement Zip

This project is a clean reset with the homepage build we discussed:
- Header: Elite Gaming logo left
- Seasons toggle (Upcoming / Current)
- Seasons horizontal carousel (wide premium glass cards w/ MCG background overlay)
- Quick Previews (NOT scrolling):
  - Match of the Round (iOS glass style)
  - Ladder Top 4: Magpies, Blues, Bombers, Suns
  - Top 5 Goal Kickers (includes Cats)

## Run
```bash
npm install
npm run dev
```

## Supabase SQL scripts
Run these in the Supabase SQL editor (in order):

1. `scripts/sql/001_preseason_registrations.sql`
2. `scripts/sql/002_fix_next_fixture_rpc.sql`
3. `scripts/sql/003_profiles_admin.sql`

Admin grant snippet:
```sql
update public.profiles
set is_admin = true
where user_id = 'YOUR-USER-UUID';
```

## IMPORTANT
Replace the placeholder `public/assets/mcg.jpg` with your real MCG image (same filename).
Also add:
- public/assets/elite-gaming-logo.png
- public/assets/proteam-logo.png
- public/assets/afl26-logo.png
# Elite-Gaming-App
