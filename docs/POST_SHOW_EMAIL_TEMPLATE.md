# Post-Show Email Template

This email is sent to attendees after they experience About Last Night.

## Email Configuration

**Subject:** Your case file is ready

**From:** Max / StoryPunk (or your email system's configured sender)

**Variables needed from ticketing system:**
- `{{FIRST_NAME}}` - Attendee's first name
- `{{MMDD}}` - Show date in 4-digit format (e.g., `1123` for November 23)

---

## Email Body

```
Hey {{FIRST_NAME}},

First of all, thank you.

About Last Night… is a weird, ambitious thing that we've been building for over a year. It's a pop-up. It's experimental. It only exists because people like you decide to show up and trust us with your precious free time. So thank you for taking a chance on a new and unusual experience. I hope it gave you something worth remembering.

Speaking of memories — Detective Anondono's case file is ready:

https://aboutlastnightgame.com/reports/report{{MMDD}}.html

It's built from what your group chose to bring to light. You might see threads you recognize, or pieces that fill in things you didn't get to. Every session surfaces a different slice of the story.

---

If you want to share anything from the night — photos, theories, hot takes — we'd love to see it. Tag @storypunkstudio on Instagram or StoryPunk on Facebook.

And if you've got thoughts on the experience (what worked, what didn't, what confused you), I genuinely want to hear them:

https://aboutlastnightgame.com/feedback.html?date={{MMDD}}

And if you ever decide you'd like to return to play again or want to bring your own crew through, please reach out. We'd love to set you up with a discount code — consider it a thank you for coming back.

Thanks again for being part of this.

Bora "Max" Koknar        Shuai Chen
Creative Director        Chief Puzzle Officer
StoryPunk                Patchwork Adventures
```

---

## Links in Email

| Link | Purpose | URL Pattern |
|------|---------|-------------|
| Case file | Detective's report for that session | `https://aboutlastnightgame.com/reports/report{{MMDD}}.html` |
| Feedback form | Post-show survey | `https://aboutlastnightgame.com/feedback.html?date={{MMDD}}` |
| Instagram | Social sharing | Tag `@storypunkstudio` |
| Facebook | Social sharing | Tag `StoryPunk` |

---

## Before Sending Each Email

1. **Generate the detective report** for that session using the Director Console
2. **Commit and push** `report{{MMDD}}.html` to deploy it to GitHub Pages
3. **Wait 2-3 minutes** for deployment
4. **Verify the report URL works** before sending emails

---

## Date Format Reference

The date format is `MMDD` (month + day, no year, no separators):
- November 23 → `1123`
- December 4 → `1204`

The feedback form uses a date picker, so no manual date management is needed — any date can be selected.
