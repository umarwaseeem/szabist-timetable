# Usage notes

Details trimmed from the main README.

## Run it locally

Requires Node 20 or newer. No dependencies to install.

```sh
npm run fetch           # collect today's schedule into data/
npm run fetch:programs  # refresh the list of program PDFs
npm run dev             # serve on http://localhost:4173
npm test                # run the parser tests
```

Add `?now=HH:MM` to the URL to preview the page at a chosen time of day,
for example <http://localhost:4173/?now=12:15>.

## Try it on a phone before it's deployed

With the dev server running, open a tunnel in a second terminal:

```sh
npm run tunnel   # runs: ngrok http 4173
```

ngrok prints a public `https://…ngrok-free.app` address. Open it on the phone.
The free plan shows a one-time "Visit Site" notice first. The address changes
each time ngrok restarts. HTTPS is required for the microphone to work.

## Optional AI assistant

The "Ask" button in the top bar opens a small chat. Type or speak a question
such as "where is my next class?" and get an answer from the day's schedule.

- It uses Google's Gemini API directly from the browser. Each person pastes
  their own API key, which is stored in that browser only and sent to Google
  with each question together with the day's schedule. Nothing is stored by
  this project. Get a free key at <https://aistudio.google.com/app/apikey>.
- Voice input uses the browser's speech recognition. Chrome and Safari support
  it. Spoken replies use the browser's speech synthesis and are off by default.
- The page tries `gemini-2.5-flash` first with thinking turned off, then falls
  back to lighter models if Google reports the model as busy.

Never commit an API key to this repository. The site is static, so any key in
the code would be public.

## How the schedule updates

See the "Keeping the data current" section in the README. In short: a
scheduled GitHub Action re-scrapes the noticeboard and commits the result,
so the site always shows what was last collected, not a live read of the
university page.

### When does the noticeboard publish the next day?

The noticeboard shows one day's table, but the "day" it shows is not always
today. Two direct checks:

- 2026-10-08, 19:10 PKT: the board still showed that same Thursday's table.
- 2026-10-12, 22:44 PKT: the board already showed Tuesday the 13th's table,
  a day early, even though its own "Schedule for Monday" header (which comes
  from a different field than the table) still correctly said Monday.

So the next day's board goes live sometime in the evening before, somewhere
in that roughly three-and-a-half-hour window. The workflow currently runs
four evening probes at 19:30, 20:30, 21:30 and 22:30 PKT to narrow this down
for real: once `data/days/<date>.json` starts reliably appearing at the same
probe a few days running, drop the others and keep one evening cron.

To check: compare `data/index.json`'s `latest` field across consecutive runs
in the Action logs, or run `git log --follow --format='%ai %s' -- data/days/<date>.json`
for a given date to see which run's commit first introduced it.

The parser itself does not need to change for this: it always reads the date
from the table's own title line, not from the page's "Schedule for ..."
header, so an early fetch is saved under the correct (tomorrow's) filename
automatically.

## Data shape

Each `data/days/<date>.json` file looks like this:

```json
{
  "date": "2026-10-08",
  "weekday": "Thursday",
  "semester": "Fall 2026",
  "fetchedAt": "2026-10-08T02:00:00.000Z",
  "slots": [{ "id": "1", "label": "Slot 1", "range": { "start": 480, "end": 660 } }],
  "classes": [{
    "id": "1-bba-1-a-ba-1215-08-00-am-10-00-am",
    "sr": 1,
    "slot": "1",
    "department": "Management Sciences",
    "program": "BBA",
    "section": "BBA-1 A",
    "course": { "code": "BA 1215", "title": "Ideology and Constitution of Pakistan", "credits": null },
    "faculty": "Sadia Rasool",
    "room": "102",
    "online": false,
    "time": { "raw": "08:00 AM - 10:00 AM", "start": 480, "end": 600 },
    "campus": "H-8"
  }]
}
```

Times are minutes after midnight, Pakistan time.

## Not yet done

- Parsing the per-program semester PDFs. Each program uses a different layout
  and the text overlaps, so the page links to the PDFs instead.
- A weekly view. It becomes possible once a few days of data are collected.
