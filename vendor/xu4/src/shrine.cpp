/*
 * shrine.cpp
 */

#include <string>

#include "shrine.h"

#include "game.h"
#include "imagemgr.h"
#include "party.h"
#include "portal.h"
#include "screen.h"
#include "settings.h"
#include "tileset.h"
#include "u4.h"
#include "web_talk.h"
#include "xu4.h"

/**
 * Returns true if the player can use the portal to the shrine
 */
bool shrineCanEnter(const Portal *p) {
    Shrine *shrine = dynamic_cast<Shrine*>(xu4.config->map(p->destid));
    if (!c->party->canEnterShrine(shrine->virtue)) {
        screenMessage("Thou dost not bear the rune of entry!  A strange force keeps you out!\n");
        return 0;
    }
    return 1;
}

const char* Shrine::getName() const {
    // Todo 32: deliberately NOT inventoried for translation. This is a
    // std::string builder, not a screenMessage() literal, so it never enters
    // the ui:* screenMessage inventory. Its only callers are the cheat menu
    // ("Goto: <name>" and "Location: <name>" in vendor/xu4/src/cheat.cpp, which
    // game.cpp pushes explicitly) and DISCOURSE_VENDOR -- and a shrine never
    // hosts a vendor, because the one "vendors" discourse is a town-NPC
    // resource loaded in game.cpp. No normal player ever sees this string, so
    // adding a translation entry would be an unreachable phantom row.
    // tests/unit/virtue-names.test.ts asserts the cheat-only reachability and
    // that "Shrine of " stays out of every generated template table.
    std::string& str = c->shrineState.shrineName;
    str = "Shrine of ";
    str += getVirtueName(virtue);
    return str.c_str();
}

const char* Shrine::mantraStr() const {
    return xu4.config->symbolName(mantra);
}

/**
 * Enter the shrine
 */
void Shrine::enter() {
    const char* input;
    ShrineState* ss = &c->shrineState;
    int choice;

    if (ss->advice.empty()) {
        U4FILE *avatar = u4fopen("avatar.exe");
        if (!avatar)
            return;
        ss->advice = u4read_stringtable(avatar, 93682, 24);
        u4fclose(avatar);
    }

    gameSetViewMode(VIEW_CUTSCENE_MAP);
    if (xu4.settings->enhancements &&
        xu4.settings->enhancementsOptions.u5shrines)
        enhancedSequence();
    else
        screenMessage("You enter the ancient shrine and sit before the altar...");

    screenMessage("\nUpon which virtue dost thou meditate?\n");
    input = EventHandler::readString(32);

    screenMessage("\n\nFor how many Cycles (0-3)? ");
    choice = EventHandler::readChoice("0123\015\033");
    if (choice == '\033' || choice == '\015')
        ss->cycles = 0;
    else
        ss->cycles = choice - '0';
    ss->completedCycles = 0;

    screenMessage("\n\n");

    // ensure the player chose the right virtue and entered a valid number for cycles
    if (strncasecmp(input, getVirtueName(virtue), 6) != 0 || ss->cycles == 0) {
        screenMessage("Thou art unable to focus thy thoughts on this subject!\n");
        eject();
    }
    else if (((c->saveGame->moves / SHRINE_MEDITATION_INTERVAL) >= 0x10000) ||
            (((c->saveGame->moves / SHRINE_MEDITATION_INTERVAL) & 0xffff) != c->saveGame->lastmeditation)) {
        screenMessage("Begin Meditation\n");
        meditationCycle();
    }
    else {
        screenMessage("Thy mind is still weary from thy last Meditation!\n");
        eject();
    }

    gameSetViewMode(VIEW_NORMAL);
}

void Shrine::enhancedSequence() {
    /* replace the 'static' avatar tile with grass */
    annotations.add(Coords(5, 6, c->location->coords.z),
            tileset->getByName(Tile::sym.grass)->getId(), false, true);

    screenHideCursor();
    screenMessage("You approach\nthe ancient\nshrine...\n");
    gameUpdateScreen();
    EventHandler::wait_msecs(1000);

    const Creature* beggar = xu4.config->creature(BEGGAR_ID);
    Object *obj = addCreature(beggar, Coords(5, 10, c->location->coords.z));

    // Change graphic to the Avatar (which has no animation).
    obj->animControl(ANIM_PAUSED);
    obj->tile = tileset->getByName(Tile::sym.avatar)->getId();

    for (int i = 0; i < 4; ++i) {
        gameUpdateScreen();
        EventHandler::wait_msecs(400);
        c->location->map->move(obj, DIR_NORTH);
    }

    gameUpdateScreen();
    EventHandler::wait_msecs(800);

    obj->tile = beggar->tile;
    obj->animControl(ANIM_PLAYING);

    screenMessage("\n...and kneel before the altar.\n");
    gameUpdateScreen();
    EventHandler::wait_msecs(1000);
    screenShowCursor();
}

void Shrine::meditationCycle() {
    /* Calculate the millisecond interval for meditation */
    int interval = (xu4.settings->shrineTime * 1000) / MEDITATION_MANTRAS_PER_CYCLE;
    if (interval < 50)
        interval = 50;

    c->saveGame->lastmeditation = (c->saveGame->moves / SHRINE_MEDITATION_INTERVAL) & 0xffff;

    screenHideCursor();
    for (int i = 0; i < MEDITATION_MANTRAS_PER_CYCLE; i++) {
        screenUploadToGPU();
        if (EventHandler::wait_msecs(interval))
            return;
        screenMessage(".");
    }
    askMantra();
}

void Shrine::askMantra() {
    const char* input;
    ShrineState* ss = &c->shrineState;

    screenShowCursor();
    screenMessage("\nMantra: ");

    input = EventHandler::readString(4);
    screenMessage("\n");

    if (strcasecmp(input, mantraStr()) != 0) {
        c->party->adjustKarma(KA_BAD_MANTRA);
        screenMessage("Thou art not able to focus thy thoughts with that Mantra!\n");
        eject();
    }
    else if (--ss->cycles > 0) {
        ss->completedCycles++;
        c->party->adjustKarma(KA_MEDITATION);
        meditationCycle();
    }
    else {
        ss->completedCycles++;
        c->party->adjustKarma(KA_MEDITATION);

        bool elevated = ss->completedCycles == 3 && c->party->attemptElevation(virtue);
        if (elevated) {
            // Todo 32: the `%s` is getVirtueName(virtue), i.e. English engine
            // text, so the web shell translates it as a `%s` argument through
            // GENERATED_MODULE_NAMES: the eight virtue names resolve to the
            // ready Korean module:Ultima-IV:maps:* rows that maps.b already
            // declares (`shrine (virtue: "Honesty" ...)`) and locales/ko has
            // already translated. tests/unit/virtue-names.test.ts proves this
            // line composes to pure Hangul for all eight virtues.
            screenMessage("\nThou hast achieved partial Avatarhood in the Virtue of %s\n",
                          getVirtueName(virtue));
            gameSpellEffect(-1, -1, SOUND_ELEVATE);
        } else
            screenMessage("\nThy thoughts are pure. "
                          "Thou art granted a vision!\n");

        EventHandler::waitAnyKey();
        showVision(elevated);
        EventHandler::waitAnyKey();
        eject();
    }
}

void Shrine::showVision(bool elevated) {
    if (elevated) {
        screenMessage("\nThou art granted a vision!\n");
        gameSetViewMode(VIEW_CUTSCENE);
        const Symbol* visionImageNames = &BKGD_SHRINE_HON;
        screenDrawImageInMapArea(visionImageNames[virtue & 7]);
    } else {
        ShrineState* ss = &c->shrineState;
        // Todo 29: the vision advice is original AVATAR.EXE data (read from
        // offset 93682 above), so the web dialogue panel gets it as an
        // "avatar.exe:shrineAdvice:<n>" id -- never as text, exactly like the
        // codex/endgame lines. The advice index is the same one that picks
        // the string below: three advice lines per virtue, one per completed
        // meditation cycle, so virtue * 3 + (cycles - 1) covers 0-23 exactly
        // once. The "\n%s" format is placeholder-only and stays out of
        // GENERATED_UI_TEMPLATES, so the screenMessage hash path drops this
        // line and the panel draws it exactly once. Compiled away in native
        // builds (web_talk.h).
        u4WebTalkId("\n%s", "avatar.exe:shrineAdvice", virtue * 3 + ss->completedCycles - 1);
        screenMessage("\n%s", ss->advice[virtue * 3 + ss->completedCycles - 1].c_str());
    }
}

void Shrine::eject() {
    xu4.game->exitToParentMap();
    musicPlayLocale();
    c->location->turnCompleter->finishTurn();
}
