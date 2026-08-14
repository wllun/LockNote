import React from 'react';

const pad = (value) => String(value).padStart(2, '0');

const ReminderDateTimePicker = ({ mode, value, onChange }) => {
  const inputValue = mode === 'date'
    ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    : `${pad(value.getHours())}:${pad(value.getMinutes())}`;

  return React.createElement('input', {
    type: mode,
    value: inputValue,
    min: mode === 'date' ? new Date().toISOString().slice(0, 10) : undefined,
    'aria-label': mode === 'date' ? 'Reminder date' : 'Reminder time',
    onChange: (event) => {
      const next = new Date(value);
      if (mode === 'date') {
        const [year, month, day] = event.target.value.split('-').map(Number);
        next.setFullYear(year, month - 1, day);
      } else {
        const [hour, minute] = event.target.value.split(':').map(Number);
        next.setHours(hour, minute, 0, 0);
      }
      onChange(next);
    },
    style: {
      minHeight: 44,
      borderRadius: 10,
      border: '1px solid #dfe3ee',
      padding: '8px 10px',
      fontSize: 16,
      color: 'inherit',
      background: 'transparent',
    },
  });
};

export default ReminderDateTimePicker;

