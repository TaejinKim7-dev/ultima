/*
 * Native unit test for the xu4 CDI/module loader (vendor/xu4/src/module.c).
 *
 * Scope: this test exercises mod_query() only. mod_query() opens a module
 * file, reads its CDI header/TOC/MODI chunk, and returns MOD_UNKNOWN on any
 * structural failure. It never calls u4find_pathc() (that only happens in
 * mod_addLayer()'s "requires a base module" resolution path), so the stub
 * below is safe: it exists only to satisfy the linker, since module.c's
 * translation unit references u4find_pathc() from mod_addLayer() even
 * though this test never calls mod_addLayer().
 *
 * Fixtures:
 *   - empty file            -> must be rejected (MOD_UNKNOWN)
 *   - corrupted magic bytes -> must be rejected (MOD_UNKNOWN)
 *   - argv[1] (render.pak)      -> must be accepted (non-zero category)
 *   - argv[2] (Ultima-IV.mod)   -> must be accepted (non-zero category)
 *
 * argv[1]/argv[2] are produced by `npm run build:modules`. Run
 * `npm run deps:host && npm run build:modules` before this test so the
 * positive cases have real artifacts to open.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "module.h"
#include "support/stringTable.h"

int u4find_pathc(const char* fname, const char* ext, char* path, size_t pathMax)
{
    (void) fname; (void) ext; (void) path; (void) pathMax;
    return 0;
}

static int failures = 0;

static void expect(int cond, const char* label)
{
    if (cond) {
        printf("  ok   %s\n", label);
    } else {
        printf("  FAIL %s\n", label);
        ++failures;
    }
}

static int queryFile(const char* path)
{
    StringTable st;
    int category;

    sst_init(&st, 8, 32);
    category = mod_query(path, &st);
    sst_free(&st);
    return category;
}

/* Write buf[0..len) to a fresh temp file and return a malloc'd path
   the caller must free() and unlink(). Aborts the test on I/O failure. */
static char* writeTempFile(const void* buf, size_t len)
{
    char* path = strdup("/tmp/xu4-module-test-XXXXXX");
    int fd = mkstemp(path);
    if (fd < 0) {
        perror("mkstemp");
        exit(2);
    }
    if (len > 0) {
        ssize_t n = write(fd, buf, len);
        if (n < 0 || (size_t) n != len) {
            perror("write");
            exit(2);
        }
    }
    close(fd);
    return path;
}

static void testEmptyFileRejected(void)
{
    char* path = writeTempFile(NULL, 0);
    expect(queryFile(path) == MOD_UNKNOWN, "empty file is rejected");
    unlink(path);
    free(path);
}

static void testGarbageFileRejected(void)
{
    static const char garbage[] = "this is not a CDI package at all";
    char* path = writeTempFile(garbage, sizeof(garbage));
    expect(queryFile(path) == MOD_UNKNOWN, "garbage-content file is rejected");
    unlink(path);
    free(path);
}

/* Copy realModulePath, flip its 4-byte CDI magic header, and confirm the
   loader rejects the corrupted copy. Skips (does not fail) if
   realModulePath cannot be read, so this only runs once real artifacts
   from `npm run build:modules` exist. */
static void testCorruptedRealModuleRejected(const char* realModulePath)
{
    FILE* fp;
    unsigned char* buf;
    long size;
    char* path;

    if (!realModulePath) return;

    fp = fopen(realModulePath, "rb");
    if (!fp) {
        printf("  skip corrupted-module case (%s not found)\n", realModulePath);
        return;
    }
    fseek(fp, 0, SEEK_END);
    size = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    if (size < 4) {
        fclose(fp);
        printf("  skip corrupted-module case (%s too small)\n", realModulePath);
        return;
    }

    buf = (unsigned char*) malloc((size_t) size);
    if (fread(buf, 1, (size_t) size, fp) != (size_t) size) {
        perror("fread");
        exit(2);
    }
    fclose(fp);

    /* CDI magic is the first 4 bytes (0xDA 0x7A 0x70 0x00, see cdi.h
       DA7A_CONTAINER_CDI_PAK). Flipping every bit invalidates it. */
    buf[0] ^= 0xFF;
    buf[1] ^= 0xFF;
    buf[2] ^= 0xFF;
    buf[3] ^= 0xFF;

    path = writeTempFile(buf, (size_t) size);
    expect(queryFile(path) == MOD_UNKNOWN, "corrupted copy of a real module is rejected");
    unlink(path);
    free(path);
    free(buf);
}

static void testRealModuleAccepted(const char* path, const char* label)
{
    FILE* fp;
    if (!path) return;

    fp = fopen(path, "rb");
    if (!fp) {
        printf("  FAIL %s must exist (run npm run build:modules first): %s\n", label, path);
        ++failures;
        return;
    }
    fclose(fp);

    expect(queryFile(path) != MOD_UNKNOWN, label);
}

int main(int argc, char** argv)
{
    const char* renderPak   = argc > 1 ? argv[1] : NULL;
    const char* ultimaIVMod = argc > 2 ? argv[2] : NULL;

    printf("module-package: negative cases\n");
    testEmptyFileRejected();
    testGarbageFileRejected();
    testCorruptedRealModuleRejected(renderPak);

    printf("module-package: positive cases\n");
    testRealModuleAccepted(renderPak, "render.pak opens through the CDI/module loader");
    testRealModuleAccepted(ultimaIVMod, "Ultima-IV.mod opens through the CDI/module loader");

    if (failures > 0) {
        printf("module-package: %d failure(s)\n", failures);
        return 1;
    }
    printf("module-package: all checks passed\n");
    return 0;
}
