<script setup lang="ts">
defineProps<{
  currentStep: number
  title: string
  subtitle?: string
}>()

const stepLabels = ['Account', 'Practice', 'Clinician', 'Insurance', 'BAA', 'Billing', 'Welcome']
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-12 px-4">
    <!-- Logo -->
    <img src="/logo-primary.png" alt="Datable Health" class="h-8" />

    <!-- Step progress indicator -->
    <div class="flex items-center gap-0 mt-8">
      <template v-for="(label, index) in stepLabels" :key="index">
        <div class="flex flex-col items-center">
          <!-- Dot -->
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
            :class="{
              'bg-teal-600 text-white': index + 1 === currentStep,
              'bg-gray-400 text-white': index + 1 < currentStep,
              'border-2 border-gray-300 text-gray-400 bg-white': index + 1 > currentStep,
            }"
          >
            <!-- Completed: checkmark -->
            <svg
              v-if="index + 1 < currentStep"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <!-- Current or upcoming: step number -->
            <span v-else>{{ index + 1 }}</span>
          </div>
          <!-- Label -->
          <span
            class="mt-1 text-[10px] font-medium"
            :class="{
              'text-teal-600': index + 1 === currentStep,
              'text-gray-500': index + 1 !== currentStep,
            }"
          >
            {{ label }}
          </span>
        </div>
        <!-- Connector line (not after last) -->
        <div
          v-if="index < stepLabels.length - 1"
          class="w-8 h-0.5 mb-5 flex-shrink-0"
          :class="index + 1 < currentStep ? 'bg-gray-400' : 'bg-gray-200'"
        />
      </template>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-[560px] p-8 mt-8">
      <!-- Back slot -->
      <slot name="back" />

      <!-- Heading -->
      <div class="mb-6">
        <h1 class="text-xl font-semibold text-gray-900">{{ title }}</h1>
        <p v-if="subtitle" class="text-sm text-gray-500 mt-1">{{ subtitle }}</p>
      </div>

      <!-- Main content -->
      <slot />

      <!-- Continue slot -->
      <slot name="continue" />
    </div>
  </div>
</template>
