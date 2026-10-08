# Design notes

## Purpose

Students at SZABIST Islamabad check a dense HTML table every day to find their
classes. The table lists every class in the university, about 180 rows, with no
filter. The job of this page is to answer "where is my next class?" in one
glance on a phone.

## Data

- Source: the ZabDesk student noticeboard. One day at a time, server rendered,
  9 columns, grouped under slot headers and a make-up block.
- Collection: a Node script with no dependencies parses the table into JSON.
  GitHub Actions runs it on a schedule and commits the result, so the archive
  grows one file per day.
- The per-program semester PDFs are linked, not parsed. Their layouts differ
  per program and the text overlaps when extracted.

## Interface

- Hero: the weekday as a large wordmark, the date and semester, the Islamabad
  time and the class count. A day picker for archived days.
- Your sections: choose a program, then toggle section chips. Chosen sections
  persist in `localStorage`. Sections from several programs can be mixed, which
  covers open electives and merged sections.
- Two views. "My classes" is a flat time-ordered list with a live "now" line,
  an "Up next" card, and a status tag for the running and next class.
  "Everyone" groups by slot. The current and next slot start open, the rest are
  collapsed so the page stays short on a phone.
- Filters: search across course, teacher, room, section and program; slot;
  campus or online.

## Visual system

- Type: Bricolage Grotesque, one family, with the optical size axis used for
  the large weekday. Tabular numerals for times.
- Color: a cool grey-green paper (`#edf1ee`), deep ink (`#152228`), pine green
  for actions (`#1d5c4d`), and marigold (`#f2b33d`) reserved for "now". Dark
  theme mirrors the same roles. Theme follows the system and can be pinned.
- Structure carries meaning: hairlines separate classes, the marigold left bar
  marks the running class, dimmed rows are finished. No shadows, no cards for
  individual classes.

## Accessibility

- Landmarks, labelled controls, a skip link, visible focus rings, 44px targets.
- Result counts and the chosen-section list announce through `aria-live`.
- Finished classes carry visually hidden "finished" text, so status does not
  rely on colour alone.
- Reduced motion is respected. The page prints without the controls.
