# 08: Upload + step pipeline + Read

**What to build:** I upload the PDF of a tender and an entry is created in the archive. The pipeline runs step by step with visible status, so you can see that the process is alive and where it has got to. The first step reads the document and extracts the text per page, through an interchangeable extraction engine.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Upload of a PDF with creation of a tender in the archive
- [ ] The pipeline runs step by step with status visible in the webapp
- [ ] The Read extracts the text per page
- [ ] The extraction engine is behind an interface, with at least two swappable implementations
- [ ] Replacing the engine touches neither the pricing nor the interface
- [ ] Test on external behaviour: the upload leads to a tender with pipeline status and text per page
