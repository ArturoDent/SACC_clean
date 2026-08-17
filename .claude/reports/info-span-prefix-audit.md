# `span.info` entries not starting with "SACC proposal"

Audit of every `<span class="info">...</span>` in `clean/baseline/**` (11
files) for whether its full text content starts with `SACC proposal`.
**146 of 1,374 `span.info` elements (10.6%) do not.**

They fall into three structurally distinct groups, based on what
immediately precedes the span in the DOM.

## 1. Continuation after an italicized name or a link (52) — benign

The sentence "SACC proposal ... to recognize *X* as a separate species"
often needs to keep `<i>` (species name) or `<a>` (link to the proposal
page) as its own element, splitting one logical sentence into 2–3 adjacent
`<span class="info">` runs around it. These fragments naturally don't start
with "SACC proposal" themselves — they're the back half (or middle) of a
sentence whose front half does. Not an inconsistency; no action needed.

1. [SACCBaseline.htm:560](../../clean/baseline/SACCBaseline.htm#L560) — `and saltuarius each as separate species did not pass because of insufficient published data.`
2. [SACCBaseline.htm:765](../../clean/baseline/SACCBaseline.htm#L765) — `as congeners; Oressochen Bannister 1870 becomes the name for these two when treated in a separate genus`
3. [SACCBaseline.htm:1405](../../clean/baseline/SACCBaseline.htm#L1405) — `passed to modify linear sequence`
4. [SACCBaseline03.htm:792](../../clean/baseline/SACCBaseline03.htm#L792) — `as a separate species passed`
5. [SACCBaseline03.htm:1313](../../clean/baseline/SACCBaseline03.htm#L1313) — `passed to change English name to "Snowy-bellied"`
6. [SACCBaseline03.htm:1323](../../clean/baseline/SACCBaseline03.htm#L1323) — `. saucerottei sensu stricto`
7. [SACCBaseline04.htm:660](../../clean/baseline/SACCBaseline04.htm#L660) — `passed to change linear sequence of genera in Charadriidae.`
8. [SACCBaseline04.htm:758](../../clean/baseline/SACCBaseline04.htm#L758) — `passed to change linear sequence of genera in Charadriidae`
9. [SACCBaseline04.htm:2128](../../clean/baseline/SACCBaseline04.htm#L2128) — `passed to split into two or three species`
10. [SACCBaseline04.htm:3156](../../clean/baseline/SACCBaseline04.htm#L3156) — `to Ardea`
11. [SACCBaseline04.htm:3688](../../clean/baseline/SACCBaseline04.htm#L3688) — `passed to add to main list`
12. [SACCBaseline04.htm:4177](../../clean/baseline/SACCBaseline04.htm#L4177) — `into M. atricapilla did not pass.`
13. [SACCBaseline05.htm:385](../../clean/baseline/SACCBaseline05.htm#L385) — `passed to change linear sequence`
14. [SACCBaseline05.htm:1423](../../clean/baseline/SACCBaseline05.htm#L1423) — `passed to change linear sequence within Veniliornis`
15. [SACCBaseline05.htm:1709](../../clean/baseline/SACCBaseline05.htm#L1709) — `as a separate species did not pass`
16. [SACCBaseline05.htm:1882](../../clean/baseline/SACCBaseline05.htm#L1882) — `and Phalcoboenus into Daptrius did not pass.`
17. [SACCBaseline05.htm:1883](../../clean/baseline/SACCBaseline05.htm#L1883) — `did not pass`
18. [SACCBaseline05.htm:2493](../../clean/baseline/SACCBaseline05.htm#L2493) — `as a separate species did not pass.`
19. [SACCBaseline05.htm:2550](../../clean/baseline/SACCBaseline05.htm#L2550) — `passed to change linear sequence of species`
20. [SACCBaseline06.htm:1287](../../clean/baseline/SACCBaseline06.htm#L1287) — `did not pass`
21. [SACCBaseline06.htm:1751](../../clean/baseline/SACCBaseline06.htm#L1751) — `as a separate species`
22. [SACCBaseline06.htm:1955](../../clean/baseline/SACCBaseline06.htm#L1955) — `. SACC proposal passed to recognize S. petrophilus`
23. [SACCBaseline06.htm:2014](../../clean/baseline/SACCBaseline06.htm#L2014) — `. alvarezlopezi`
24. [SACCBaseline07.htm:644](../../clean/baseline/SACCBaseline07.htm#L644) — `at the species rank did not pass`
25. [SACCBaseline07.htm:850](../../clean/baseline/SACCBaseline07.htm#L850) — `as conspecific with S. ruficapilla did not pass`
26. [SACCBaseline07.htm:1092](../../clean/baseline/SACCBaseline07.htm#L1092) — `SACC passed to change linear sequence`
27. [SACCBaseline07.htm:1273](../../clean/baseline/SACCBaseline07.htm#L1273) — `. SACC proposal passed to recognize johnsoni as a species`
28. [SACCBaseline07.htm:1364](../../clean/baseline/SACCBaseline07.htm#L1364) — `and P. erythropterum`
29. [SACCBaseline07.htm:1786](../../clean/baseline/SACCBaseline07.htm#L1786) — `passed to resurrect Dendroplex for these two species`
30. [SACCBaseline07.htm:1819](../../clean/baseline/SACCBaseline07.htm#L1819) — `did not pass.`
31. [SACCBaseline07.htm:1893](../../clean/baseline/SACCBaseline07.htm#L1893) — `as a species and also elevate subspecies layardi and fuscicapillus to species rank. SACC proposal passed on English names`
32. [SACCBaseline08.htm:721](../../clean/baseline/SACCBaseline08.htm#L721) — `as a species.`
33. [SACCBaseline08.htm:768](../../clean/baseline/SACCBaseline08.htm#L768) — `passed to determine English names`
34. [SACCBaseline08.htm:902](../../clean/baseline/SACCBaseline08.htm#L902) — `as a separate species`
35. [SACCBaseline08.htm:1951](../../clean/baseline/SACCBaseline08.htm#L1951) — `as a subspecies of`
36. [SACCBaseline08.htm:1952](../../clean/baseline/SACCBaseline08.htm#L1952) — `viridiflavus`
37. [SACCBaseline08.htm:1953](../../clean/baseline/SACCBaseline08.htm#L1953) — `instead of`
38. [SACCBaseline08.htm:2697](../../clean/baseline/SACCBaseline08.htm#L2697) — `(including`
39. [SACCBaseline08.htm:2698](../../clean/baseline/SACCBaseline08.htm#L2698) — `) as a separate species from Pyrocephalus rubinus`
40. [SACCBaseline08.htm:2700](../../clean/baseline/SACCBaseline08.htm#L2700) — `as a separate species from`
41. [SACCBaseline08.htm:2701](../../clean/baseline/SACCBaseline08.htm#L2701) — `did not pass. SACC proposal to treat the`
42. [SACCBaseline08.htm:2702](../../clean/baseline/SACCBaseline08.htm#L2702) — `group as a separate species from nominate`
43. [SACCBaseline08.htm:2703](../../clean/baseline/SACCBaseline08.htm#L2703) — `did not pass. SACC proposal passed to establish English names for the two species.`
44. [SACCBaseline09.htm:224](../../clean/baseline/SACCBaseline09.htm#L224) — `group as a separate species from`
45. [SACCBaseline09.htm:510](../../clean/baseline/SACCBaseline09.htm#L510) — `passed to return to leucopyga as the species name`
46. [SACCBaseline09.htm:855](../../clean/baseline/SACCBaseline09.htm#L855) — `New SACC proposals passed to revise Thryothorus and linear sequences of species`
47. [SACCBaseline11.htm:318](../../clean/baseline/SACCBaseline11.htm#L318) — `New SACC proposal to recognize microrhynchus and pacificus as separate species did not pass`
48. [SACCBaseline11.htm:1049](../../clean/baseline/SACCBaseline11.htm#L1049) — `passed to transfer to Cardinalidae`
49. [SACCBaseline11.htm:1235](../../clean/baseline/SACCBaseline11.htm#L1235) — `to treat aequatorialis as a separate species did not pass`
50. [SACCBaseline11.htm:1239](../../clean/baseline/SACCBaseline11.htm#L1239) — `as a separate species`
51. [SACCBaseline11.htm:1837](../../clean/baseline/SACCBaseline11.htm#L1837) — `and Chrysocorypha did not pass`
52. [SACCBaseline11.htm:3129](../../clean/baseline/SACCBaseline11.htm#L3129) — `. SACC proposal passed to revise species limits in the group`

## 2. A word left unwrapped between two `.info` spans (29) — genuine gap

The clearest case is
[SACCBaseline02.htm:584](../../clean/baseline/SACCBaseline02.htm#L584):
`<span class="info">SACC </span>proposal<span class="info"> passed to
recognize <i>Coccycua</i>.</span>` — the word "proposal" itself sits
**outside** both spans as bare text. Every entry below is the second half
of one of these: a `.info` span immediately preceded by unwrapped plain
text (rather than by an `<i>`/`<a>`), meaning a word or short phrase was
left out of the styling in the original document.

1. [SACCBaseline.htm:64](../../clean/baseline/SACCBaseline.htm#L64) — `blue`
2. [SACCBaseline.htm:905](../../clean/baseline/SACCBaseline.htm#L905) — `pecific with versicolor did not pass`
3. [SACCBaseline.htm:1042](../../clean/baseline/SACCBaseline.htm#L1042) — `Proposal to recognize subfamilies in the Cracidae did not pass`
4. [SACCBaseline02.htm:584](../../clean/baseline/SACCBaseline02.htm#L584) — `SACC` (first half of the Coccycua example above)
5. [SACCBaseline02.htm:584](../../clean/baseline/SACCBaseline02.htm#L584) — `passed to recognize Coccycua.`
6. [SACCBaseline02.htm:847](../../clean/baseline/SACCBaseline02.htm#L847) — `SACC`
7. [SACCBaseline02.htm:848](../../clean/baseline/SACCBaseline02.htm#L848) — `passed to reassign to Chordeiles`
8. [SACCBaseline02.htm:944](../../clean/baseline/SACCBaseline02.htm#L944) — `New SACC proposal passed to revise generic limits in nightjars, including placement of maculicaudus in Hydropsalis.`
9. [SACCBaseline02.htm:1022](../../clean/baseline/SACCBaseline02.htm#L1022) — `SACC`
10. [SACCBaseline02.htm:1023](../../clean/baseline/SACCBaseline02.htm#L1023) — `for enlarged Hydropsalis did not pass.`
11. [SACCBaseline04.htm:803](../../clean/baseline/SACCBaseline04.htm#L803) — `). SACC proposal to treat ater and bachmani as conspecific did not pass`
12. [SACCBaseline04.htm:2016](../../clean/baseline/SACCBaseline04.htm#L2016) — `Proposal passed to add to main list. Proposal passed to change name from "Little Blue Penguin" to "Little Penguin."`
13. [SACCBaseline04.htm:2131](../../clean/baseline/SACCBaseline04.htm#L2131) — `Subsequent SACC proposal passed to split into three species`
14. [SACCBaseline04.htm:4314](../../clean/baseline/SACCBaseline04.htm#L4314) — `Proposal passed to merge Pseudoscops into Asio`
15. [SACCBaseline05.htm:1000](../../clean/baseline/SACCBaseline05.htm#L1000) — `. SACC proposal passed to merge Baillonius into Pteroglossus. SACC proposal passed to change linear sequence.`
16. [SACCBaseline05.htm:2400](../../clean/baseline/SACCBaseline05.htm#L2400) — `Subsequently, SACC proposal to lump griseipectus into P. leucotis passed. SACC proposal passed to transfer subspecies emma from P. leucotis to P. picta. SACC proposal passed to re-elevate P. griseipectus to species rank.`
17. [SACCBaseline05.htm:2615](../../clean/baseline/SACCBaseline05.htm#L2615) — `New SACC proposal to change to "White-winged Parakeet" did not pass`
18. [SACCBaseline06.htm:1089](../../clean/baseline/SACCBaseline06.htm#L1089) — `passed`
19. [SACCBaseline06.htm:1919](../../clean/baseline/SACCBaseline06.htm#L1919) — `. SACC proposal passed to modify linear sequence in`
20. [SACCBaseline06.htm:2007](../../clean/baseline/SACCBaseline06.htm#L2007) — `Proposal passed to recognize S. rodriguezi. SACC proposal passed to change English name.`
21. [SACCBaseline07.htm:1891](../../clean/baseline/SACCBaseline07.htm#L1891) — `. SACC proposal passed to recognize`
22. [SACCBaseline08.htm:767](../../clean/baseline/SACCBaseline08.htm#L767) — `SACC`
23. [SACCBaseline09.htm:1473](../../clean/baseline/SACCBaseline09.htm#L1473) — `). SACC proposal passed to move to main list.`
24. [SACCBaseline11.htm:470](../../clean/baseline/SACCBaseline11.htm#L470) — `. SACC proposal to treat armenti as a separate species did not pass`
25. [SACCBaseline11.htm:749](../../clean/baseline/SACCBaseline11.htm#L749) — `A second proposal to change English names to "Whitestarts" also did not pass.`
26. [SACCBaseline11.htm:821](../../clean/baseline/SACCBaseline11.htm#L821) — `New SACC proposal to treat roraimae as a separate species did not pass.`
27. [SACCBaseline11.htm:1810](../../clean/baseline/SACCBaseline11.htm#L1810) — `. SACC proposal passed to merger Pyrrhocoma into Thlypopsis.`
28. [SACCBaseline11.htm:1993](../../clean/baseline/SACCBaseline11.htm#L1993) — `). SACC proposal passed to resurrect Tephrospilus`
29. [SACCBaseline11.htm:3077](../../clean/baseline/SACCBaseline11.htm#L3077) — `. SACC proposal passed to recognize three species`

## 3. Standalone — not part of any adjacent `.info` run (65)

These spans have no `.info`, `<i>`, or `<a>` sibling immediately before
them — they're either the very first fragment of a differently-phrased
proposal sentence, or `class="info"` used for something else entirely
(mostly navigation/header text, concentrated in `SACCBaseline.htm`, which
is the site's front-matter page rather than a species-account page).

1. [SACCBaseline.htm:47](../../clean/baseline/SACCBaseline.htm#L47) — `Proposal Roster`
2. [SACCBaseline.htm:50](../../clean/baseline/SACCBaseline.htm#L50) — `Remsen`
3. [SACCBaseline.htm:68](../../clean/baseline/SACCBaseline.htm#L68) — `Remsen`
4. [SACCBaseline.htm:103](../../clean/baseline/SACCBaseline.htm#L103) — `AOU's NACC Checklist`
5. [SACCBaseline.htm:107](../../clean/baseline/SACCBaseline.htm#L107) — `For lists of species recorded from each country and territory (using SACC classification and criteria) within the SACC region, including downloadable EXCEL file, see SACC Country Lists`
6. [SACCBaseline.htm:128](../../clean/baseline/SACCBaseline.htm#L128) — `Hypothetical List`
7. [SACCBaseline.htm:143](../../clean/baseline/SACCBaseline.htm#L143) — `click here`
8. [SACCBaseline.htm:145](../../clean/baseline/SACCBaseline.htm#L145) — `Click here for rationale`
9. [SACCBaseline.htm:196](../../clean/baseline/SACCBaseline.htm#L196) — `Comitê Brasileiro de Registros Ornitológicos`
10. [SACCBaseline.htm:236](../../clean/baseline/SACCBaseline.htm#L236) — `* SACC proposal for adopting BOU-like guidelines on defining "introduced" species did not pass, but the committee is strongly in favor of developing formal guidelines. Meanwhile, we follow AOS/NACC criterion:`
11. [SACCBaseline.htm:243](../../clean/baseline/SACCBaseline.htm#L243) — `Sjoerd Maijer, In Memoriam`
12. [SACCBaseline.htm:534](../../clean/baseline/SACCBaseline.htm#L534) — `Hybrids and Dubious Taxa`
13. [SACCBaseline.htm:559](../../clean/baseline/SACCBaseline.htm#L559) — `idoneus`
14. [SACCBaseline.htm:718](../../clean/baseline/SACCBaseline.htm#L718) — `Click here`
15. [SACCBaseline.htm:765](../../clean/baseline/SACCBaseline.htm#L765) — `Neochen jubatus`
16. [SACCBaseline.htm:1021](../../clean/baseline/SACCBaseline.htm#L1021) — `Click here`
17. [SACCBaseline.htm:1255](../../clean/baseline/SACCBaseline.htm#L1255) — `Hybrids and Dubious Taxa`
18. [SACCBaseline.htm:1263](../../clean/baseline/SACCBaseline.htm#L1263) — `Hybrids and Dubious Taxa`
19. [SACCBaseline03.htm:792](../../clean/baseline/SACCBaseline03.htm#L792) — `diamantinensis`
20. [SACCBaseline03.htm:1323](../../clean/baseline/SACCBaseline03.htm#L1323) — `S`
21. [SACCBaseline04.htm:2429](../../clean/baseline/SACCBaseline04.htm#L2429) — `SACC`
22. [SACCBaseline04.htm:2431](../../clean/baseline/SACCBaseline04.htm#L2431) — `passed to add to main list`
23. [SACCBaseline04.htm:3156](../../clean/baseline/SACCBaseline04.htm#L3156) — `ibis`
24. [SACCBaseline04.htm:4176](../../clean/baseline/SACCBaseline04.htm#L4176) — `sanctaecatarinae`
25. [SACCBaseline05.htm:1708](../../clean/baseline/SACCBaseline05.htm#L1708) — `splendens`
26. [SACCBaseline05.htm:1882](../../clean/baseline/SACCBaseline05.htm#L1882) — `Milvago`
27. [SACCBaseline05.htm:2269](../../clean/baseline/SACCBaseline05.htm#L2269) — `Psittacara`
28. [SACCBaseline05.htm:2493](../../clean/baseline/SACCBaseline05.htm#L2493) — `luchsi`
29. [SACCBaseline06.htm:1240](../../clean/baseline/SACCBaseline06.htm#L1240) — `Akletos`
30. [SACCBaseline06.htm:1240](../../clean/baseline/SACCBaseline06.htm#L1240) — `into`
31. [SACCBaseline06.htm:1241](../../clean/baseline/SACCBaseline06.htm#L1241) — `Percnostola`
32. [SACCBaseline06.htm:1241](../../clean/baseline/SACCBaseline06.htm#L1241) — `did not pass`
33. [SACCBaseline06.htm:1287](../../clean/baseline/SACCBaseline06.htm#L1287) — `Gymnopithys`
34. [SACCBaseline06.htm:1751](../../clean/baseline/SACCBaseline06.htm#L1751) — `leymebambae`
35. [SACCBaseline06.htm:1920](../../clean/baseline/SACCBaseline06.htm#L1920) — `Scytalopus`
36. [SACCBaseline06.htm:2014](../../clean/baseline/SACCBaseline06.htm#L2014) — `S`
37. [SACCBaseline06.htm:2016](../../clean/baseline/SACCBaseline06.htm#L2016) — `2`
38. [SACCBaseline06.htm:2047](../../clean/baseline/SACCBaseline06.htm#L2047) — `Scytalopus`
39. [SACCBaseline06.htm:2224](../../clean/baseline/SACCBaseline06.htm#L2224) — `2`
40. [SACCBaseline07.htm:643](../../clean/baseline/SACCBaseline07.htm#L643) — `espinhacensis`
41. [SACCBaseline07.htm:850](../../clean/baseline/SACCBaseline07.htm#L850) — `cinerea`
42. [SACCBaseline07.htm:1052](../../clean/baseline/SACCBaseline07.htm#L1052) — `amacurensis`
43. [SACCBaseline07.htm:1245](../../clean/baseline/SACCBaseline07.htm#L1245) — `7`
44. [SACCBaseline07.htm:1363](../../clean/baseline/SACCBaseline07.htm#L1363) — `P. rufum`
45. [SACCBaseline07.htm:1819](../../clean/baseline/SACCBaseline07.htm#L1819) — `beauperthuysii`
46. [SACCBaseline07.htm:1892](../../clean/baseline/SACCBaseline07.htm#L1892) — `fatimalimae`
47. [SACCBaseline08.htm:720](../../clean/baseline/SACCBaseline08.htm#L720) — `T. leucura`
48. [SACCBaseline08.htm:767](../../clean/baseline/SACCBaseline08.htm#L767) — `s`
49. [SACCBaseline08.htm:901](../../clean/baseline/SACCBaseline08.htm#L901) — `guayaquilensis`
50. [SACCBaseline08.htm:905](../../clean/baseline/SACCBaseline08.htm#L905) — `salvini`
51. [SACCBaseline08.htm:1951](../../clean/baseline/SACCBaseline08.htm#L1951) — `flavidifrons`
52. [SACCBaseline08.htm:1952](../../clean/baseline/SACCBaseline08.htm#L1952) — `Z.`
53. [SACCBaseline08.htm:1953](../../clean/baseline/SACCBaseline08.htm#L1953) — `Z. chrysops`
54. [SACCBaseline08.htm:2078](../../clean/baseline/SACCBaseline08.htm#L2078) — `3`
55. [SACCBaseline08.htm:2697](../../clean/baseline/SACCBaseline08.htm#L2697) — `nanus`
56. [SACCBaseline08.htm:2697](../../clean/baseline/SACCBaseline08.htm#L2697) — `dubius`
57. [SACCBaseline08.htm:2699](../../clean/baseline/SACCBaseline08.htm#L2699) — `dubius`
58. [SACCBaseline08.htm:2700](../../clean/baseline/SACCBaseline08.htm#L2700) — `nanus`
59. [SACCBaseline08.htm:2702](../../clean/baseline/SACCBaseline08.htm#L2702) — `obscurus`
60. [SACCBaseline08.htm:2703](../../clean/baseline/SACCBaseline08.htm#L2703) — `rubinus`
61. [SACCBaseline08.htm:3052](../../clean/baseline/SACCBaseline08.htm#L3052) — `1`
62. [SACCBaseline09.htm:224](../../clean/baseline/SACCBaseline09.htm#L224) — `chivi`
63. [SACCBaseline09.htm:225](../../clean/baseline/SACCBaseline09.htm#L225) — `V. olivaceus`
64. [SACCBaseline11.htm:1239](../../clean/baseline/SACCBaseline11.htm#L1239) — `aequatorialis`
65. [SACCBaseline11.htm:1836](../../clean/baseline/SACCBaseline11.htm#L1836) — `Maschalethraupis`

Within this group, entries 1–18 (all in `SACCBaseline.htm`) are the clearest
case of `class="info"` used for genuinely unrelated content — navigation
links and front-matter notes, not proposal citations. The rest are mostly
species-name fragments (e.g. `idoneus`, `diamantinensis`, `Scytalopus`) that
begin a multi-span sentence continued in group 1/2's entries, or short
number/letter fragments (`2`, `7`, `S`) from footnote markers.

## Method

Parsed each `clean/baseline/*.htm` file with jsdom (`includeNodeLocations:
true` for line numbers), selected every `span.info`, and checked whether
its full (whitespace-collapsed) `textContent` starts with `SACC proposal`.
1,374 total `span.info` elements found across 11 files; 146 do not. Each
was further classified by inspecting the node immediately preceding it in
the DOM. No changes made — this is a report only.
