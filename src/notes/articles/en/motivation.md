---
title: Why I made Tomoshibi
summary: From wanting an Akari lamp to making a mold generator for building washi lamps at home.
category: Build notes
---

# Why I made Tomoshibi

## It started with Akari {#starting-by-copying}

I originally wanted an Akari light by Isamu Noguchi. They are beautiful, very popular, and still made by hand, so they always seemed to be sold out whenever I looked. For a long time I had almost given up on buying one.

Then, while doomscrolling through Instagram Reels, I kept seeing people overseas making DIY washi lamps. If I could not buy one, maybe I could make one. Things you make with your own hands tend to become more lovable anyway, and it felt like a good project to begin.

What I want Tomoshibi to make possible is not reproducing a particular work, but learning from lantern structure and creating a washi lamp in your own shape.

## How to make the mold {#why-a-mold-helps}

As I looked more closely at washi lights, I learned how important the mold and bamboo structure are in lantern-making. I started by researching that process, then thinking about how it could be reproduced at home.

The key part is the mold that defines the shape of the shade. If I could make that mold well, I thought the rest of the process, winding bamboo and pasting washi, might somehow come together.

There were a few possible ways to make it.

- make it from cardboard
- cut it from wooden boards
- make it with a 3D printer

Lantern makers seem to use wooden or metal molds, but those felt too difficult and time-consuming to reproduce at home. Cardboard and 3D printing felt more approachable. If those two routes worked, more people could try making washi lamps in their own homes.

## Avoiding the CAD wall {#leaving-failures-behind}

The next problem was how to design the shape of the mold. I am not especially good at CAD, and I felt that if I had to model every mold by hand, I would probably get stuck before making the lamp.

So I decided to make software that makes the mold for me. If it worked, it would not only help me; it might let people around the world enjoy making their own washi lamps.

I wanted Tomoshibi to make the process feel as simple as possible: decide the shape, print the parts, assemble the mold. Those are the three steps I wanted someone to need before they could begin making a lamp.

## Starting with 3D printing {#first-prototype}

I had a 3D printer at home that had been gathering dust, so this was a good excuse to use it again. I started with the 3D-printed mold route first, because if I could make a working mold that way, I would feel more confident publishing the site.

The basic idea was to edit the side profile of the lamp and generate the mold parts from that profile. I also wanted to show a 3D preview in the browser, so first-time users could understand what they were about to make.

Most of the implementation was done with Claude Code. The idea for Tomoshibi came to me on a train while I was heading out for a hike, and I was able to start prototyping it right there. It really is an astonishing time to be making things.

## Looking at the mold structure {#learning-from-akari}

I also visited a specialist shop in Tokyo to learn more about the structure of lights made with traditional lantern-making techniques. They had a mold on display, and it became an important reference for this project.

I was especially curious about the notched outer edge that catches the bamboo. Seeing how that part of the mold was shaped helped a lot.

## The first build worked {#first-build}

Thanks to all of that, I managed to make a first lamp. There are still many things I want to improve, but the washi light I made with my own hands has its own charm, and I was very happy with it.

I would like to improve support for larger molds and the cardboard route in the future.

There is also one difficult problem with this kind of lamp-making: even if Tomoshibi can help make the shade, lamp sockets are different around the world. The way the light is mounted changes depending on what socket or fixture someone has, so I plan to write about that in a separate note.

## What these notes are for {#what-notes-are-for}

I am still learning by trial and error as I make washi lamps myself. I plan to collect what I learn here in Notes.

The build guide is meant to stay focused on the shortest path to making a lantern. Material choices, mistakes, design reasons, and small discoveries fit better here, where they do not interrupt the step-by-step flow.

Tomoshibi is a site for helping people enjoy making washi lamps with their own hands. I would be happy if people used it to try different shapes, draw on the washi, or make lamps together with friends and family.

If you make something, please show it to me by tagging me on Instagram or X. You should be able to find me as `shunyakoide`.

Enjoy making your washi lamp.
