-- The 15 public government sites monitored at launch.
--
-- Before going live, open every URL in a browser: agencies change domains often.
-- Monitor only the public landing page people reach first, never a login page.
--
-- Safe to re-run: existing rows (matched by slug) are updated, not duplicated.
-- Adding a site later = add a row here (or insert it directly). No code change.

insert into public.monitors (slug, name, url, category, is_public, owner_id, sort_order)
values
  -- Benefits & contributions
  ('pag-ibig',         'Pag-IBIG Fund',            'https://www.pagibigfund.gov.ph/',                    'benefits', true, null, 10),
  ('virtual-pag-ibig', 'Virtual Pag-IBIG',         'https://www.pagibigfundservices.com/virtualpagibig/', 'benefits', true, null, 20),
  ('sss',              'SSS',                      'https://www.sss.gov.ph/',                            'benefits', true, null, 30),
  ('my-sss',           'My.SSS',                   'https://member.sss.gov.ph/members/',                 'benefits', true, null, 40),
  ('philhealth',       'PhilHealth',               'https://www.philhealth.gov.ph/',                     'benefits', true, null, 50),

  -- IDs & documents
  ('dfa-passport',     'DFA Passport Appointment', 'https://www.passport.gov.ph/',                       'ids',      true, null, 10),
  ('psa-serbilis',     'PSA Serbilis',             'https://www.psaserbilis.com.ph/',                    'ids',      true, null, 20),
  ('nbi-clearance',    'NBI Clearance',            'https://clearance.nbi.gov.ph/',                      'ids',      true, null, 30),
  ('philsys',          'PhilSys National ID',      'https://philsys.gov.ph/',                            'ids',      true, null, 40),
  ('lto-ltms',         'LTO LTMS',                 'https://portal.lto.gov.ph/',                         'ids',      true, null, 50),

  -- Tax & licensing
  ('bir',              'BIR',                      'https://www.bir.gov.ph/',                            'tax',      true, null, 10),
  ('prc-leris',        'PRC LERIS',                'https://online.prc.gov.ph/',                         'tax',      true, null, 20),

  -- Others
  ('comelec',          'COMELEC',                  'https://comelec.gov.ph/',                            'others',   true, null, 10),
  ('egov',             'eGov PH',                  'https://e.gov.ph/',                                  'others',   true, null, 20),
  ('csc',              'Civil Service Commission', 'https://csc.gov.ph/',                                'others',   true, null, 30)
on conflict (slug) do update set
  name       = excluded.name,
  url        = excluded.url,
  category   = excluded.category,
  is_public  = excluded.is_public,
  sort_order = excluded.sort_order;
