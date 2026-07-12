## Unsorted Ideas for 0.17 

- Past a certain readable zoom level titles should no longer be displayed.  
  ![[Pasted image 20260709001206.png]]
- Using OS zoom controls within a note should re-size text independently from the rest of the board. 
- The grey smokey top bar only appears when the cursor is very nearly on the edge of the possible ui. There is maybe a single pixel row that triggers it. hovering anywhere over the normal window chrome bar should be showing the gradient. 
  
  The location of the board button seems reasonable to me. No hard end to the gradient is okay if we can get the trigger location tuned. 
```
- [ ] **Title strip fidelity** (AI-IMP-191, 2026-07-08, your
  screenshots): hover the top edge — the smoky band should breathe
  in over ~a fifth of a second (not pop); the board name is bare
  text clear of the traffic lights (no pill); dragging the empty
  band still moves the window. TWO CALLS FOR YOU: (1) the Board
  button moved to the strip's top-right (the bare path now owns the
  corner) — right home for it? (2) the prototype carries a hairline
  border under the strip; the builder omitted it (a hairline reads
  as "a bar," which decision-01 rejects) — agree, or want the line?
```
- clicking the canvas outside of the gradient UI does not dismiss the dialogue 
![[Pasted image 20260709002238.png]]
- As shown above the home button is not centered vs the trafffic lights and the forward and back buttons are rendered black and are not visible except on hover. 
- The Pins are loading and the note is being placed properly in relation to the cursor however this revealed that our creation wizard for the pins vs node notes are completely unique ui's that should probably have a design and unification pass. 
![[Pasted image 20260709003648.png]]
