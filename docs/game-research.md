# Noobius game research

Research date: **September 7, 2026**. Public primary sources only; no wallet connection, transactions, or authenticated gameplay. These notes consolidate the session’s research for product design, not investment forecasting.

## Kintara: the breadth benchmark

Kintara documents a persistent browser MMO: connected realms, gathering, inventory/hotbar, banking, building, shops, quests, PvE/PvP, friends and trading. Its five skill families are Combat, Woodcutting, Mining, Fishing and Cooking. Short actions feed preparation and travel into harder areas; three repeatable jobs would represent only one subsystem of that design.

The current public configuration enables free play. Docs describe a total-level-10 free cap; holding 1,000 KINS opens further progression/realms, and maintaining that balance for 24 hours unlocks trading and other restricted functions. Parties and teleport-to-friend are explicitly not live.

Ordinary item trading uses gold. Players may separately list gold for another player to buy with KINS: 95% goes to the seller and 5% to the treasury. This is buyer-dependent trading, not guaranteed gold redemption or automatic token emissions. Ordinary player-to-player gold transfers do not create new aggregate gold, despite loose language in the economy overview. Docs also describe a paid spinner; it is not needed for Noobius’s core loop.

Sources: [player documentation](https://kintara.com/#docs), [public documentation module](https://kintara.com/site/js/components/docs.js), [current public configuration](https://kintara.com/client-config.js). Documentation and configuration establish intended rules; this review did not independently test every mechanic or audit server enforcement. No substantiated historical market-cap peak is claimed here.

## Relevant projects and transferable lessons

### FLOKI / Valhalla — direct memecoin-origin example

Official news confirms mainnet live in July 2025 and subsequent patches through February 2026. Its game combines exploration, collecting/training Vera creatures, turn-based battles, daily quests and clan objectives. Distinct locations provide shops, healing and upgrades. Runix/Onyx support routine progression; FLOKI staking tiers provide meaningful progression benefits, not just cosmetics.

**Learn:** give a recognizable mascot an explorable world with useful locations, persistent collection and shared objectives. Token popularity, sponsorship impressions and tournament prizes do not establish retention or operating revenue; a comparable reliable series was not found in this review.

Sources: [official news](https://floki.com/news), [beginner guide](https://wiki.valhalla.game/Beginner-s-Guide-22119cce029f81ec8d23ff72ffad3f35), [clans](https://wiki.valhalla.game/Clans-22119cce029f813a890ff1856682023d), [currencies](https://wiki.valhalla.game/Runix-Onyx-22119cce029f81768d4ce1201d0398ce), [FLOKI tiers](https://wiki.valhalla.game/Account-Floki-Tiers-22119cce029f81209acbcafa5abb7b5f?pvs=21).

### Pixels — adjacent crypto game, not a memecoin project

Live social farming/crafting game. The project reports 10 million+ cumulative players and $20 million revenue in 2024; neither proves current active users or audited profitability. Task-board orders connect specific goods and quantities to coins, XP and sometimes token rewards. Token-paying orders are not guaranteed.

The team’s own review acknowledges excessive emissions, extraction and insufficient endgame/resource sinks. Some proposed fixes, including durability and progressive land upgrades, remain labelled production/prototype stages in the reviewed roadmap.

**Learn:** production chains and work orders make routine actions serve longer goals. Reward design must account for actual spending and reasons to keep progressing.

Sources: [site](https://www.pixels.xyz/), [task board](https://help.pixels.xyz/en/articles/9165794-what-is-the-task-board), [lessons learned and 2024 revenue](https://litepaper.pixels.xyz/usdpixel-whitepaper/lessons-learned-and-revised-vision), [gameplay review and roadmap statuses](https://litepaper.pixels.xyz/core-pixels-and-gameplay).

### Sunflower Land — adjacent crypto game, not a memecoin project

Live browser farming/crafting game; its homepage reports 700,000+ players cumulatively. NPC deliveries connect resource production to relationships, gifts and unlocks; island expansion and chapters provide longer goals. Yakkamon preregistration is not proof of that newer product’s full launch.

An earlier economy reform introduced off-chain Coins after token inflation and extractive farming problems. Current FLOWER documentation describes recycling an average 75% of spent FLOWER into rewards. Recycling depends on continued spending; it does not guarantee sustainability. Older guides retaining SFL terminology should not be treated as current token specifications.

**Learn:** small resource chains can support several meaningful choices: contracts, crafting, expansion and collection.

Sources: [site](https://sunflower-land.com/), [deliveries](https://docs.sunflower-land.com/player-guides/deliveries), [historical Coins reform](https://docs.sunflower-land.com/economy/coins), [current FLOWER tokenomics](https://docs.sunflower-land.com/project/economy-tokenomics).

### Axie Infinity — adjacent crypto game; useful longevity and retrenchment evidence

Axie reported crossing 2 million daily active players in October 2021; that is historical, not current. Origins remains active in September 2026. Classic’s regular competitive seasons and active development are scheduled to pause after September 10. Homeland was sunset when Terrariums launched in June; Atia’s Legacy remains in playtesting.

Newer bAXS rewards are not directly transferable but can convert into liquid AXS at a score-dependent rate. It would be incorrect to describe them as impossible to cash out.

**Learn:** collection, equipment development and strategic mastery can sustain identity across sessions. Historical scale does not make every subsequent game mode viable.

Sources: [historical adoption](https://blog.axieinfinity.com/p/october), [current Origins update](https://blog.axieinfinity.com/p/welcome-to-origins-postseason-18), [Classic pause](https://blog.axieinfinity.com/p/axie-classic-competitive-season-16), [Terrariums/Homeland](https://blog.axieinfinity.com/p/terrariums-v1-is-live), [Atia’s playtest](https://blog.axieinfinity.com/p/atias-legacy-playtest-3-is-live), [bAXS](https://blog.axieinfinity.com/p/baxs-is-live).

## Six original Noobius adaptations

These are design proposals, not existing Noobius capabilities or copied game content.

1. **The first shift becomes the tutorial.** Three introductory repairs unlock a persistent employee record and the first department, instead of resetting into the same three jobs forever.
2. **Connected repair production.** Recover damaged boards and copper; craft replacement modules; diagnose a fault; install the right component; restore a rack. Parts also serve workshop upgrades and contracts, creating choices.
3. **Distinct technical specialties.** Hardware, Cooling and Networks gain separate XP and tools. Later failures combine specialties, such as a cluster that needs both coolant restoration and switch repair.
4. **An inhabitable facility.** Explore a workshop, salvage depot, cooling plant, break room and control room. Put upgrades and interactions in these locations; let cleared outages visibly transform the facility.
5. **Departments with personalities.** Recurring NPC coworkers offer contracts, running jokes and promotions. Relationships unlock blueprints and story chapters; cosmetic trophies commemorate notable mistakes and achievements.
6. **Shared incidents and personal mastery.** Crews contribute asynchronously to a facility-wide outage while players pursue individual repair scores, collections and seasonal objectives. Introduce funded, limited external reward events separately from everyday progression.

Suggested connecting loop: **explore → salvage → craft → diagnose/repair → gain department XP → upgrade workshop → unlock rooms/contracts → contribute to shared incidents**. Facility capacity is a game statistic unless real infrastructure integration is independently implemented; it should not imply real compute revenue.

## Evidence and economy limits

**Product traction does not equal token return or sustainable rewards.** Cumulative registrations, DAU, marketplace volume, revenue, prize pools and token market capitalization measure different things. Project-reported revenue is not audited profit; no comparable independently verified retention series was established in this bounded review.

For Noobius, measure return visits, session completion, progression depth, resource reuse and actual spending against reward and operating costs. Its everyday game economy can reward XP, credits, parts, tools and cosmetics. Any external reward pool needs an actual funding source and eligibility rules; none of these precedents substantiates automatic NBIS exposure or guaranteed NOOBIUS payouts.
