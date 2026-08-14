import React from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';

const ReminderDateTimePicker = ({ mode, value, onChange }) => (
  <DateTimePicker
    mode={mode}
    value={value}
    minimumDate={mode === 'date' ? new Date() : undefined}
    onChange={(_, selected) => onChange(selected || value)}
  />
);

export default ReminderDateTimePicker;

