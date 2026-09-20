# Native test harness for the pinned xu4/Boron sources exported under
# vendor/. Vendor trees are read-only inputs here: verify:repo-sources
# hashes every file physically present under vendor/<name>, so nothing in
# this project may write into vendor/. All generated files go under
# CMAKE_BINARY_DIR (i.e. build/native/), which is gitignored.

set(XU4_SRC    ${CMAKE_SOURCE_DIR}/vendor/xu4/src)
set(BORON_ROOT ${CMAKE_SOURCE_DIR}/vendor/boron)

# module.h does `#include <boron/urlan.h>`, but vendor/boron/include/ has no
# "boron" subdirectory (that layout is only created by boron's own
# `make install-dev`, which requires write access outside the repo). Build a
# symlink farm under the build directory instead of touching vendor/.
set(BORON_SHIM_DIR ${CMAKE_BINARY_DIR}/boron_shim)
file(REMOVE_RECURSE ${BORON_SHIM_DIR})
file(MAKE_DIRECTORY ${BORON_SHIM_DIR}/boron)
foreach(hdr urlan.h boron.h urlan_atoms.h)
    file(CREATE_LINK ${BORON_ROOT}/include/${hdr} ${BORON_SHIM_DIR}/boron/${hdr} SYMBOLIC)
endforeach()

# Only the CDI/module loader and the Urlan array primitives it needs
# (ur_arrInit/ur_arrFree, see vendor/boron/urlan/array.c) are compiled here.
# This does not build the Boron interpreter -- that is a separate host tool
# built by `npm run deps:host` (scripts/deps-host.mjs) and only needed to
# run the .b packaging scripts, not to open/validate the resulting modules.
add_library(xu4_module_core STATIC
    ${XU4_SRC}/module.c
    ${XU4_SRC}/support/cdi.c
    ${XU4_SRC}/support/stringTable.c
    ${BORON_ROOT}/urlan/array.c
)
target_include_directories(xu4_module_core PUBLIC
    ${XU4_SRC}
    ${XU4_SRC}/support
    ${BORON_SHIM_DIR}
    ${BORON_ROOT}/include
    ${BORON_ROOT}/urlan
)
target_compile_options(xu4_module_core PRIVATE -Wall -Wextra)

add_executable(module_package_test tests/module_package_test.c)
target_link_libraries(module_package_test PRIVATE xu4_module_core)

# Optional positional args point at real artifacts from `npm run
# build:modules`; the test skips (not fails) the cases that need them if
# they are absent, and cmake-wrapper.mjs explains that in its output.
set(HOST_MODULES_DIR ${CMAKE_SOURCE_DIR}/build/host/modules)
add_test(NAME module-package COMMAND module_package_test
    ${HOST_MODULES_DIR}/render.pak
    ${HOST_MODULES_DIR}/Ultima-IV.mod
)
