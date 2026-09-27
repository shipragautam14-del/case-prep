# Consulting source documents

Put your consulting prep material here (PDF, DOCX, PPTX, TXT or MD). Subfolders are fine.
Examples: the Issac Jojy chapters (00–14), the ICON IIMB casebook, the ICON industry reports,
your consulting checklist and your own framework cheat sheets.

File naming drives how a document is used:
- names containing `casebook`, `case book`, `ICON` or `transcript` are treated as **casebooks**.
  `npm run extract-cases` turns them into interactive cases. They are never retrieved into a live case.
- names containing `industry`, `report` or `sector` are treated as **industry reports**.
- everything else is treated as **guide** material (method, frameworks, interview advice).

Then run `npm run ingest` (the server also refreshes the index at start-up).
These files are git-ignored so private course material isn't pushed to the repository.
