<template>
  <div style="font-family: monospace; padding: 2rem">
    <nav style="margin-bottom: 2rem">
      <NuxtLink to="/">/</NuxtLink> |
      <NuxtLink to="/flaky">/flaky (isr: true)</NuxtLink> |
      <NuxtLink to="/flaky-ttl">/flaky-ttl (isr: 60)</NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>
