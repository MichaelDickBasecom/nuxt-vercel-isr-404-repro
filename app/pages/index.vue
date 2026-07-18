<template>
  <div>
    <h1>P2 demo — app-rendered 404s cached forever under isr: true</h1>
    <p>
      /flaky and /flaky-ttl render the same page whose SSR fails ~50% of the
      time and converts that into a fatal 404. Run scripts/poison-demo.sh
      against this deployment — see README.
    </p>
  </div>
</template>
