---
title: "Modern CMake for C++ Projects"
date: "2025-09-08"
description: "A useful guide to help you get started with CMake"
tags: 
  - "CMake"
  - "C++"
---

Today's blog is written in collaboration with my friend [Martin Broholm Andersen](https://github.com/MBroholmA).

Martin and I are both C++ programmers, but we come from different programming traditions. 
These differences provide us with a rich source of subjects to argue about. 
We both learn a lot from these arguments.

I've been working for years on old Cmake projects (from the 2.x era). Martin has been busy moving legacy
`.sln` / `.vcxproj` projects at his workplace to modern, CMake 3.x style projects. 
His reasons for moving to CMake weren't to be able to cross compile or lock down binaries – but to scale, 
reorganize and merge the large code base he manages.

Martin is a Visual Studio user, I use CLion. 
We hope our mixed experience will give you a good experience no matter what tooling you prefer.

Martin's knowledge of modern CMake far exceeds mine. As he was melding his mind into mine, we both
learned (and argued) a lot. This blog contains the result of our discussions, and our final agreement on best practices
for creating modern style repos that use Cmake 3.x.

We expect that this blog will be updated and expanded to serve as a reference for both experienced developers and new
users who're just getting started with Cmake and C++.

The repo containing our template CMake project can be found on GitHub:

- [Modern Cmake](https://github.com/thomaskejser/modern-cmake).

As is the tradition on Database Doctor – I encourage disagreement and discussions.

# First things first: Pick a namespace

To play nice with other libraries, your own code should live in a namespace that is unique to you.

The namespace could be the name of the company you work for. It could be your gaming alias. The name of your dog or
anything else that is likely be too unique. Think of it the same way you think of a domain name – it is your little,
unique piece of the Internet.

## Why Pick a namespace?

When your code is consumed, particularly if that code is a library, you don't know what other libraries
you might co-exist with. Instead of polluting the global namespace with your classes and functions – you make it clear
to the consumer of your library how to find your code: by going via your namespace!

Even the C++ standard library lives by this rule – putting all their code in the `std` namespace. Unlike other
libraries, `std` is special and has reserved the right to use `#include` that is always global, without slashes and
using brackets like this:

```c++
#include <vector>
#include <algorithm>
```

By convention, *every* other library must live inside a namespace and have an include path containing at least
one slash (hierarchical structures inside namespaces are allowed).

For example, if we use `nlohman` to parse JSON, we include it like this:

```c++
#include <nlohmann/json.hpp>
```

The namespace you pick will be used throughout your repo and by everyone who consumes your library, pick wisely.

## Our `demo` namespace and libraries

For our example repo, we use the namespace: `demo`. 
It is not very original or unique – but it is fast to type and hence good for illustration purposes.

As you can read in our [`README.md`](https://github.com/thomaskejser/modern-cmake/blob/main/README.md) we offer two libraries under the `demo` namespace:

- `shapes` - in namespace `demo::shapes`
- `renderer` - in namespace `demo::renderer`

## Consuming libraries

When you consume libraries, you don't need to prefix their namespace in your implementation files.

You can do this instead:

```c++
using namespace demo::shapes;

std::vector<Shape> make_snow_man() {
    head = Circle{5, Point{0, 2.5}}   // Circle is demo::shapes::Circle
    body = Circle{7, Point{0, 9}}
    return {head, body}
}
```

### The Rule you should never break in Namespaces

There is a rule about `using namespace` that you should always follow:

> You shall *not* put `using namespace` into public headers

Why? Because if you do this, a person including your public header may end up with a `using` declaration that
they didn't intend. This is annoying, error-prone and tricky to debug. It is not nice!

Consider this example:

Our annoying programmer "Null-pointer" Nick has a `shapes.h` public header, containing:

```c++
#pragma once

namepace demo::shapes {
using Shape = std::variant<Circle, Rectangle, Triangle>;  
}

using namespace demo::shapes;   // Truly evil
```

The poor Doctor is writing a library used to draw funny caricatures of people. The Doctor includes Nick's header
and does this:

```c++
#include <demo/shapes/shapes.h>
// Shape is not defined in the global namespace

enum class Shape { UNDERWEIGHT, NORMAL, OVERWEIGHT, AMERICAN };

Shape classify_body(double weight, double height ) {
    auto v = weight / (height * height)
    if (v < 18.5) {
        return Shape::UNDERWEIGHT;
    }
    if (v >= 18.5 && v < 25) {
        return Shape::NORMAL;
    }
    // ... etc...
}

demo::Shape draw_carricature(Shape body_classification) { 
    // ...
}
```

Doctor is now going to get some very odd compilation errors, because his definition of `Shape` does not match what Nick
did.

Summary: don't put `using namespace` in headers.

# Repo High-Level Overview

Every repo root looks like this:

- `src/` - All source files except the root level `CMakeList` lives here. Each library or executable has its own
  directory.
- `docs/` - Generic docs about the repo and usage examples for consumers. Individual projects under `src` contain docs
  and `README.md` targeted towards maintainers.
- `extern/` - external libraries we depend on are in here.
- `cmake/` - Custom functions live here. We provide a few basic ones that you might find useful.
- `.vscode/` - Visual Studio specific configuration.
- `.idea/` - Clion specific configuration.

# Root Level files

In the root of every repo, the following files are present:

- [`README.md`](#the-root-level-readmemd)
- [`LICENCE`](#the-license-file)
- [`.gitignore`](#gitignore)
- [`.gitmodules`](#gitmodules---external-modules)
- [`.clang-tidy` and `.clang-format`](#clang-tidy-and-clang-format)
- [`CMakePresents.json`](#cmakepresetsjson---configuration-options-for-your-build)
- [`CMakeList.txt`](#the-root-level-cmakeliststxt)
- [`.idea`](#clion-configuration-in-idea---particularly-miscxml)
- [`vcpkg.json`](#the-doctors-choice-vendoring-vcpkg)

## The Root level `README.md`

If you don't already know how to write `.md` files, now is a good time to learn it. It should take you no more than 
an hour to absorb.

The root level `README.md` file tells the reader what this repo is **for**. 
It provides an overview of what binaries are build and a single line about each binary and what it does. 
For detailed information about each binary, you can link to the `README.md` file inside the directory
of the binary. The binary-specific readme should be located in `[root]/src/[binary]/README.md`

**Resources**

- [Getting Started with MarkDown](https://www.markdownguide.org/getting-started/)

## The `LICENSE` file

If you're using GitHub, you will be offered the option to create this file when the repo is first initialised. 
You should pick a licensing model for everything in this repo and the `LICENSE` file should contain a standard text 
pertaining to that licence.

A detailed discussion about which licence works for your situation is out of scope for this document. 
Be nice to lawyers if you need advice: At the rate LLMs are going, they will need your money soon.

## `.gitignore`

Files listed here will be ignored by Git and will not be committed to the repo. 
Our demo repo contains a standard template one you can use for your C++ project.

**Resources**

- [.gitignore documentation](https://git-scm.com/docs/gitignore)

## `.gitmodules` - external modules

If you have used `git submodule` this file will appear. 
For example, you may choose to [Vendor vcpkg,](#the-doctors-choice-vendoring-vcpkg) which will create this file.

You shouldn't need to do anything to this file, it is maintained by `git`.

## `.clang-tidy` and `.clang-format`

These files control your coding convention and how your code is formatted. 
Most IDEs will be able to consume these files directly and automatically format code as you type.

Don't argue endlessly with your project managers and programmers about coding conventions. 
Instead, use these files to force one. 
With these two files correctly configured, everyone's code will look similar and nice, and nobody has to spend any
time formatting code ... ever ... again.

`.clang-tidy` will also help you find common issue with your C++ code; it is a good idea to always run with one.

The Doctor likes the Google formatting guide (but with 120 character lines, it isn't 1980 any more).
You might have other preferences. 
The important part is to set the rules early, ideally when the repo is created. 

**Resources**

- [Clang format style options](https://clang.llvm.org/docs/ClangFormatStyleOptions.html) – Here, you find the list of various styles. Search for "BasedOnStyle"

## `CMakePresets.json` - Configuration options for your build

This file is important for all modern CMake lists and will typically grow as you support more platforms. Some people
know these presets as "variants".

Presents contain:

- Options (under `cacheVariables`) - these control things like your toolchain and platform specific build settings.
- Various directories. Where does your build and install files go?
- Toolchain and platforms used to build
- Debug, Valgrind and other special build variants along with the settings required to make them.

Presents can be made out of other presets, which allow you to create complex build variants from simpler ones. 
There are examples of this in our demo repo.

### Clion and `CMakePresets.json`

If you're using CLion, you enable the build configurations from `CMakePresets.json` by going here:

- **Settings → Build, Execution, Deployment → CMake**

Check the box for the present you want to use — and you're good to go.

## The Root level `CmakeLists.txt`

This file sets the rules of how things get built in the repo. 

You generally *don't* want to specify anything about *what* is being built here, this file isn't the recipe for how
to build the repo. 
While it is *possible* to make a single, gigantic `CMakeLists.txt` that control the entire build process, it is a bad 
idea. 
The same way it is bad to have gigantic "do it all" functions in your code. Fortunately, CMake has `add_subdirectory`
to help us make the build process modular.

When you do `add_subdirectory` in CMake, you're saying: "Everything I've defined so far is also
defined for \<this\> subdirectory". 
You can think of this almost as inheritance.

It is perhaps easier to see this in action. In the repo, we have this:

```cmake
cmake_minimum_required(VERSION 3.24)
project(demo VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(cmake/EmbedStrings.cmake)
```

This sets the basic rules:

- You need at least version 3.24 of CMake to build this.
- The project (which matches the namespace you picked earlier) is called `demo`
- We're using C++ version 23
- The Cmake modules we use are in the root. 
  Note that we're appending to the path here, in case our caller already has some clever modules they want to access.
- We introduce a handy function called `EmbedStrings` - which we can use to embed strings from files directly into C++
  code (which means we can compile them into our binaries)

Everyone under this root level `CMakeLists.txt` follow the above rules, unless they explicitly tell us otherwise.

### Various Flags and Settings

Our root `CMakeLists.txt` now proceeds to set various configuration options. 
If you need to detect what platform you're on and act accordingly, this is where you do it.

Martin plays a particularly cool trick here:

```cmake
foreach (lang IN ITEMS C CXX)
    add_compile_definitions(
            #Exclude rarely-used stuff from Windows headers
            "$<$<COMPILE_LANGUAGE:${lang}>:WIN32_LEAN_AND_MEAN;NOMINMAX;VC_EXTRALEAN>"
    )
endforeach ()
```

Our goal: Add `WIN32_LEAN_AND_MEAN`, `NOMINMAX`, `VC_EXTRALEAN` to all C and C++ compile definitions. 

We avoid using `target_compile_definitions` because it would require us to use it on all targets below us. 
Instead, we set a general rules in the root level `CMakeLists.txt` to cover all targets.

There is no `remove_compile_definitions` command in CMake, so to apply definitions for *only* C
and C++ files, we need to use generator expressions. Generator expressions get evaluated late in the CMake build
process, which allows us a second chance to branch on different conditions.

Unpacking this from outer to inner:

- For the languages C and CXX (C++ in CMake language)
- Evaluate for each target with: `$<...>`
- Then: `$<COMPILE_LANGUAGE:${lang} ... >` - This is conditional, it says: "If the compiled language is C or CXX".
  If it is, the value is 1, and the next bit gets evaluated. If 0, the entire thing evaluates to nothing and
  `add_compile_definitions` just does nothing.

Basically, this allows us to force all targets that are under our `CMakeLists.txt` which are C or C++ to have the
Windows specific compile flags set – without touching anything that is not C/C++.

Clever indeed...

### One, Global Library `plog`

We finally add a single library that should be available to everyone, namely our logger:

```cmake
find_package(plog)
```

Here, we pick `plog`, but other could be chosen too. It is generally a good idea to agree on a single log library, it
just makes things easier for everyone. Remember, we aren't building anything yet; we're setting the rules of our
repo.

### The rest of the source and `src/CMakeLists.txt`

We've now done all our global config. Finally, let us add the actual source we want to compile with:

```cmake
add_subdirectory(src)
```

This points as the next level down our tree, the `src` directory. In here, we have one directory per target exposed
to the outside world.

The file `src/CMakeList.txt` is the only file in `src` and it just contains:

```cmake
add_subdirectory(paint)
add_subdirectory(shapes)
add_subdirectory(renderer)
```
This file serves a single purpose: To point at all the targets that we want to build.

Why do this and not just refer to each directory in the root level `CMakeLists.txt`? 
Because it makes it really easy to track new targets being added or removed: they will result in a diff to this one 
file: The git history of `src/CMakeLists.txt` is the history of targets in the repo.

# Clion configuration in `.idea/` - particularly `misc.xml`

If you're using Clion from Jetbrains, you can store additional configuration in this directory. 
At the time of writing, Clion already sets up a `.gitignore` inside this directory for you. 
Typically, you will want to commit at least the `.idea/misc.xml` file here. This file contains the directories that 
Clion won't index.

If you are [vendoring `vcpkg`](#the-doctors-choice-vendoring-vcpkg) you *really* don't want a slow Java app (=Clion) to start looking into every single 
build script that `vcpkg` offers. 
Be nice and commit your ignore rule (our repo has this file committed).

# Third party sources (in `extern`) and `vcpkg`

Before we move on to our actual source code, let us sit down and talk about third party dependencies.

Martin and I have vastly different opinions. And for your reading pleasure, we will present both.

I come from a background of strictly controlling the binary you build, down to what exactly is compiled for each third
party dependency I take. 
I don't want to link or include *anything* that I not 100% in control of. 
My priority is to avoid dependencies — unless I *absolutely* need them. 
There is nothing worse than watching my build download half the internet just to import a function to lowercase a string. 
If you pull in big libraries to do small things, I get grumpy. 
I also prefer to keep linkage strictly private whenever I can, making extensive use of [Pimpl idioms](https://en.cppreference.com/w/cpp/language/pimpl.html) and 
generally except `std` being present as `#include` in my public headers.

But Martin deals with a lot of code that must flexibly integrate in ways that a-priory is unknown
to the creator of the original code. 
For example, in a setup like Martin’s, repositories from all over his organisation will be built and linked up in many 
build environments. 
When you borrow and link a third party dependency to a library from one corner of the organisation, you might want to 
externally control that this linkage is the same as for the library you're building. 
This makes a lot of sense when headers have to be binary compatible, and you need a lot of “generic” 
usages without strict control of each binary.

Our individual preferences influence how we deal with integrating `vcpkg`. 
We've provided both methods for you to choose from in our repo template.

## Martin's Choice: Using `vcpkg` from the environment

Martin generally prefers to have a `vcpkg` preinstalled on his build machines to serve up libraries to anyone building 
on it. 
This method is great when you have repositories that frequently use the same packages and if you want to save space on
your machine. In this setup, a single copy of each required library version is available on the machine. The `vcpkg`
package manager becomes part of the same subsystem that makes up the compiler toolchain.

In Martin’s setup — you install `vcpkg` on the machine itself, point the environment variable `VCPKG_ROOT` at your
installation and off you go. Any repo you compile on that machine will use the same binaries rom the same `vcpkg` 
provider.
The latest version of Visual Studio already includes `vcpkg` and will set `VCPKG_ROOT` to point to the relevant folder.

## `CMakePresets.json` for environment supplied `vcpkg`

Your presets, if you used Martin’s solution, will look something like this:

```json
{
  "name": "msvc_x64",
  "displayName": "MSVC with vcpkg external",
  "generator": "Visual Studio 17 2022",
  "binaryDir": "${sourceDir}/build/${presetName}",
  "cacheVariables": {
    "CMAKE_TOOLCHAIN_FILE": "$env{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake",
    "VCPKG_TARGET_TRIPLET": "x64-windows",
    "VCPKG_OVERLAY_PORTS": "${sourceDir}/extern/vcpkg-overlays"
  }
}
```

Notice how we will pull in ports from the local `extern` directory, but we take our `vcpkg` binary and its installed
package from the environment.

## The Doctor’s Choice: Vendoring `vcpkg`

If you want complete control over your binaries (for example, when building highly optimised and/or embedded systems)
you have the option of vendoring `vcpkg`. 
What this means is that your package manager itself is part of your repo.

This allows you to pin every single build script and be in complete control over what your external libraries
look like.

Here is how you do it:

### Submodule `vcpkg` into `extern/vcpkg`

Easiest done with a raw `git` command like this:

```shell
git submodule add https://github.com/microsoft/vcpkg.git extern/vcpkg
```

You can now pin a specific commit of `vcpkg` with:

```shell
git -C extern/vcpkg checkout <known-good-commit>   # pin vcpkg version
git commit -m "Vendor vcpkg at pinned commit"
```

### Install `vcpkg` into your repo

Next, you need to bootstrap `vcpkg`. You only need to do this once, and the invocation is:

```shell
cd extern/vcpkg
./bootstrap-vcpkg.bat
```

If you're on Linux or OSX, replace `.bat` with `.sh`

You now have a completely pinned and private version of the external package manager.

### Create the initial `vcpkg.json` manifest file and pin it

In the root of the demo repo, you will find the file `vcpkg.json`. This file locks down all versions of packages that are
supplied by `vcpkg`. You can also specify that you just need the dependency, but that you don't care what version it is.

You can use this file as a starting point for your own repos.

Once your file is updated with the external dependencies you need, you can now do this:

```shell
./extern/vcpkg/vcpkg x-update-baseline --add-initial-baseline
```

This will pin the `vcpkg` SHA to your manifest file locking the configuration down.

Note that even with Martin's solution you can still lock down individual versions with the manifest, but you're
now relying on the environments `vcpkg` to supply you those versions.

### Use `CMakePresents.json` to use your vendored `vcpkg`

In our repo, we supply a vendored `vcpkg` preset, it looks like this:

```json
{
  "name": "msvc_vendor_x64",
  "displayName": "MSVC with vcpkg vendored",
  "generator": "Visual Studio 17 2022",
  "binaryDir": "${sourceDir}/build/${presetName}",
  "cacheVariables": {
    "CMAKE_TOOLCHAIN_FILE": "${sourceDir}/extern/vcpkg/scripts/buildsystems/vcpkg.cmake",
    "VCPKG_TARGET_TRIPLET": "x64-windows",
    "VCPKG_FEATURE_FLAGS": "manifests",
    "VCPKG_OVERLAY_PORTS": "${sourceDir}/extern/vcpkg-overlays",
    "VCPKG_INSTALLED_DIR": "${sourceDir}/extern/vcpkg/installed"
  },
  "environment": {
    "VCPKG_ROOT": "${sourceDir}/extern/vcpkg"
  }
}
```

### A Warning about Vendored `vcpkg`

Vendoring allows you to be full control of every package and its binaries.

However, it comes with a downside: You will get one copy of all the binaries per repository on your machine. This can
consume substantial disk space.

Consider yourself warned. You might want Martin's solution if this concerns you.

# Structuring your Code

Let us recap, we now have:

- A name we've chosen for ourselves (in this case: `demo`).
- A structure for our repo that includes all the global rules that apply to the entire repo.
- Control over all external dependencies.
- A root level `CMakeLists.txt` controlling what rules apply to all the code.
- A pointer to a directory called `src/` where we will store our libraries and executables.

Let us make some rules for the actual code.

## Structure: Libraries and Executables each have their own directory under `src/`

If we build a library or executable, we create a new directory under `src/` for that library. Consider the
library called `shapes`:

- We add the directory `src/shapes/`
- The build of `shapes` is controlled fully by `src/shapes/CMakeLists.txt` - this includes pulling in all required 
  dependencies via `find_package` and `target_link_library`
- The build of `shapes` is enabled when we add `add_subdirectory(shapes)` into the `src/CMakeLists.txt` file.


## Namespace Usage in Libraries

Each library will expose its public headers under the namespace `demo::[library name]`. For example, the `shapes`
library will have all it is externally visible classes and functions inside this declaration:

```c++
namspace demo::shapes {
   class Rectangle {...}
   class Point {...}
   // ... etc ...
}
```

By embedding our objects into our unique namespace, we avoid naming conflicts with anyone who pulls in our
public header.

In the implementation files of the library, we can use whatever structure we like: Those files will never be
visible to the outside world. If you suffer from OCD, like I do — you will also put your internal
structures and functions into the library reserved namespace. You could also use anonymous namespaces.

## File and Namespace usage in executables

Executables just need a `int main(...)` function. The executable, like the library, has its own directory under `src/`
and we will put the main function into `main.cpp`.

In general, the only code we have in the executable will be parsing of arguments and gluing libraries together. Anything
more complex goes into a library of its own.

Executables don’t have publicly visible headers because executables aren't linked. Proper usage of namespacing is thus
less important for this case.

# Building Executables

The `paint` executable is built by `src/paint/CMakeLists.txt`. It contains this:

```cmake
add_executable(paint)

target_sources(paint
        PRIVATE
        main.cpp)

find_package(CLI11)
target_link_libraries(paint
        PRIVATE
        plog::plog
        CLI11::CLI11
        demo::renderer
        demo::shapes
)
```

Let us walk through each step:

## Naming the target and specifying sources in executables

We first define the actual executable:

```cmake
add_executable(paint)
```

While it is possible to specify sources already here, using `target_sources` is more flexible as we shall see later.

When you're creating an executable, the compiler expects to find a function with this signature in one of the
compilation units:

```c++
int main(int argc, char* arg[]);
```

Unlikely everything else you do should *not* be inside a namespace.

## Dependencies and Linking

Our executable requires the external library `CLI11` to parse the command line. 
It also needs our own `renderer` and`shapes` libraries.

Since we use `vcpkg` to manage external libraries, making `CLI11` available is straightforward, we just do this:

```cmake
find_package(CLI11)
```

We can then link with our own libraries and `CLI11` using this chant:

```cmake
target_link_libraries(paint
        PRIVATE
        plog::plog
        CLI11::CLI11
        demo::renderer
        demo::shapes
)
```

Remember that we already defined the target `plog` in our root level `CMakeLists.txt`. 
Because it was defined there and included via `add_subdirectory` it is also available our `paint` executable.

Notice how the targets have `::` in them. 
If you create libraries, you should generally expose a linkable target with a name that contains `::` instead of a 
simple name. 
Using a name like `CLI11::CLI11` tells CMake: 

> The thing called `CLI11::CLI` is target not made by this file, go look for it!
 
That target may be defined elsewhere in the repo, or it could be imported via the toolchain (`vcpkg` in our example).

To find the exact link name (a different name that what you used in`find_package`) - check your `cmake` logs. 
For example, the library `plog` shows this in the logs when you execute `find_package`:

```
The package plog is header only and can be used from CMake via:

Modern CMake:
    find_package(plog CONFIG REQUIRED)
    target_link_libraries(main PRIVATE plog::plog)```
```

# Building Libraries

You now know how to build and link executables with CMake. Libraries require a bit more care and consideration.

The public facing view of a library consists of the following components:

1) A linkable binary
2) Header files

Ad 1) The linkable binary has an extension, which depends on the operating system you're compiling against. 
The extension also depends on whether you're creating a static or dynamically linked library.

It is useful to know these extensions, so here they are for different platforms:

| Platform      | Static Library Extension | Dynamic Library Extension |
|---------------|--------------------------|---------------------------|
| Linux ./ Unix | `.a`                     | `.so`                     |
| Windows       | `.lib`                   | `.dll`                    |
| OSX           | `.a`                     | `.dylib`                  |

By convention, the file name part of the library is also pre- or post-fixed with the string `lib`. 
Don't put the name `lib` in your targets — CMake will do that for you.

Ad 2) Header files are the things consumers of your library will `#include` when they make sure of data structures
and functions in your library.

When building libraries, we want to encapsulate the functionality nicely and provide a clean API. 
If you are a Python programmer, this will sound alien to you. 
A clean API means that the public header *only* contains the data structures and function we want to make visible
to the consumer of the library — nothing more, nothing less.

This requires some care to manage, and it starts with an `include/` directory.

### Public Headers and the `include/` directory

Recall that every target we build has its own directory under `src/`. 
When building a library, we will then add another directory called: `src/[target]/include/[namespace]/[target]/`. 
With `[namespace]` being the name you've already picked.

This might seem annoying, and it is. 
But it provides us with two strong benefits:

1) Consistent `#include` patterns
2) Clear distinction between public and private headers

#### Consistently library `#include` pattern

When other people consume your library, we want them to do this:

```c++
#include <demo/shapes/shapes.h>
```

We don’t want the consumer of the library to worry about finding our `include/` directory — we simply want
the mere act of linking to the library (with `target_link_library`) to automatically provide this path.
More about this in a moment.

#### Signal library maintainers what should be publicly visible

By adopting a convention that all public headers live under `include/` we can say to maintainers of our
library: "Anything that should be visible to the outside world needs to be into this directory as a header".

Headers can serve other purposes inside a library than being public — for example, we may have headers containing
template and internal data structure that shouldn't concern outside users. 
Those shouldn't be visible to outside consumers.

### Correctly setting up `#include` paths with `cmake`

Let us bring it all together. 

To build our `shapes` library, we have this `src/shapes/CMakeLists.txt`

```cmake
set(_targetName "${PROJECT_NAME}_shapes")

add_library(${_targetName} STATIC)
add_library(demo::shapes ALIAS ${_targetName})

target_sources(${_targetName}
        PUBLIC FILE_SET installed TYPE HEADERS BASE_DIRS include
)
add_subdirectory(include/demo/shapes)
```

First, we define a variable containing the name of our library. This name will not be visible to the outside
world, so we pick one we know to be unique by doing this:

```cmake
set(_targetName "${PROJECT_NAME}_shapes")
```

The variable `PROJECT_NAME` contains our unique name. Hence, we now know that`"${PROJECT_NAME}_shapes"` is also unique.

Next, we tell `cmake` that we want a static library built:

```cmake
add_library(${_targetName} STATIC)
```

And here comes the first bit of magic: we expose the external facing, linkable target by setting an alias to
our internal name:

```cmake
add_library(demo::shapes ALIAS ${_targetName})
```

This tells users of our library: "If you want to link with me, use the target `demo::shapes`".

Now come the magic that allows us to find headers automatically, the moment we link to `demo::shapes` - we do this:

```cmake
target_sources(${_targetName}
        PUBLIC FILE_SET installed TYPE HEADERS BASE_DIRS include
)
add_subdirectory(include/demo/shapes)
```

This simply said: Anyone linking to `demo::shapes` can use the contents of `src/shapes/include/` in their
`#include` search paths.

We keep a simple `src/shapes/include/demo/shapes/CMakeLists.txt` that simply points at the public headers
we want to expose:

```cmake
target_sources(${_targetName}
        PUBLIC FILE_SET installed FILES
        point.h
        circle.h
        rectangle.h
        triangle.h
        shapes.h
)

```

All these incantations also tell tells `cmake` how to correctly copy public headers if we decide to do
`install` of our library.

It is now super easy to consume `demo::shapes` - all you need to do is this:

```cmake
target_link_library(mybinary PRIVATE demo::shapes)
```

No special search paths are needed if you design libraries this way. And the publicly visible namespace will not be
polluted with header files that don't belong there.

### Compiling the library and telling your IDE about internal headers

We've now set up our library to be easily linkable. All that remains is to compile the
library with this:

```cmake
target_sources(${_targetName}
        PRIVATE
        rectangle.cpp
        triangle.cpp
        circle.cpp
        PRIVATE FILE_SET internal TYPE HEADERS FILES
        epsilon.h
)
```

We mark our .cpp sources `PRIVATE`, meaning they’re only built into this target. 
This ensures the library is compiled only once when linked by dependents. 
If you were to mark sources `PUBLIC` or `INTERFACE`, CMake would instead inject them into every target that links to 
this library (causing them to be compiled again). This is almost never what you want—except for header-only libraries.

With the next chant: `PRIVATE FILE_SET internal TYPE HEADERS FILES` we tell  `cmake` about the `epsilon.h` internal
header. 
While that header isn't needed for compilation, it makes it a lot easier for IDEs to track what files are
actually part of our project. It also makes it clear to CMake that changes in that file invalidate the cache.

Strictly speaking, we didn't need a separate `target_sources` command for internal headers and compilation units. 
We could just add it to the `target_sources` we already have that that told CMake about the public headers. 
But both Martin and I prefer to keep internal compilation and public headers in separate command.

## A general word about `#include` orders and syntax

When you consume headers with `#include` in C++, you should generally include files in this order:

1) Internal files
2) Stdlib
3) External, third party headers

Ad 1) This is the header corresponding to the `cpp` file you are compiling, or a public facing big header with all
your data types. By including this first, we ensure that our library is self-sufficient. I.e. that its compilation
doesn't depend on external headers being transitively included from other header files. 
These internal files are included relative to the file including them with quotes. Example in `rectangle.cpp`

```c++
#include "include/demo/shapes/rectangle.h"
```

Ad 2) We consider headers from `std` to be "stable", and we want to include these files *after* our internal libraries.
This avoids the subtle case where the code inside out compilation unit (i.e. the `cpp` file) only works because we
happened to pull in stdlib indirectly via a third party dependency). 
Stdlib should always be included with brackets like this:

```c++
#include <vector>
```

Ad 3) Finally, we pull in any third party dependencies (include libraries build by our own repo and linked into
the target we're currently compiling). When we use our own libraries, the `#include` will look like this:

```c++
#include <demo/shapes/shapes.h>
```

You can enforce this rule with `.clang-format` and the demo repository contains this enforcement.

# Summary

We've now sketched out how to arrange a repository to use a modern CMake to build C++ code. 
The demo repository is public, you're free to use it as you please. We also welcome contributions.

Our repo is here:

- [Modern CMake](https://github.com/thomaskejser/modern-cmake)

There is a lot more to say about this subject. We haven't yet spoken about test integration – which has enough meat to
cover a full blog article. 
That will have to wait for another few weeks.

Until we talk again: All the best from Martin and The Doctor.
