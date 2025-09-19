import { useState, useEffect } from 'react';

export default function DaySelector({ selectedDay, onDayChange, packs = [], accent = 'blue' }) {
  // Determine which days have packs
  const availableDays = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dayGroups = {
      today: [],
      yesterday: [],
      tomorrow: [],
      thisWeek: [],
      nextWeek: [],
      later: []
    };

    const getDateGroup = (pack) => {
      const eventTime = pack?.eventTime || pack?.packOpenTime || pack?.packCloseTime;
      if (!eventTime) return 'later';
      
      try {
        const eventDate = new Date(eventTime);
        eventDate.setHours(0, 0, 0, 0);
        
        const todayDate = new Date(today);
        const diffTime = eventDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'today';
        if (diffDays === -1) return 'yesterday';
        if (diffDays === 1) return 'tomorrow';
        if (diffDays >= 2 && diffDays <= 7) return 'thisWeek';
        if (diffDays >= 8 && diffDays <= 14) return 'nextWeek';
        return 'later';
      } catch {
        return 'later';
      }
    };

    packs.forEach(pack => {
      const group = getDateGroup(pack);
      dayGroups[group].push(pack);
    });

    return Object.entries(dayGroups)
      .filter(([_, packs]) => packs.length > 0)
      .map(([day, _]) => day);
  })[0];

  const dayLabels = {
    today: "Today",
    yesterday: "Yesterday", 
    tomorrow: "Tomorrow",
    thisWeek: "This Week",
    nextWeek: "Next Week",
    later: "Later"
  };

  const getPackCount = (day) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const getDateGroup = (pack) => {
      const eventTime = pack?.eventTime || pack?.packOpenTime || pack?.packCloseTime;
      if (!eventTime) return 'later';
      
      try {
        const eventDate = new Date(eventTime);
        eventDate.setHours(0, 0, 0, 0);
        
        const todayDate = new Date(today);
        const diffTime = eventDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'today';
        if (diffDays === -1) return 'yesterday';
        if (diffDays === 1) return 'tomorrow';
        if (diffDays >= 2 && diffDays <= 7) return 'thisWeek';
        if (diffDays >= 8 && diffDays <= 14) return 'nextWeek';
        return 'later';
      } catch {
        return 'later';
      }
    };

    return packs.filter(pack => getDateGroup(pack) === day).length;
  };

  // If no packs available, don't show anything
  if (availableDays.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Pack Feed</h1>
          
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-600 mr-3">Show:</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {availableDays.map(day => {
                const packCount = getPackCount(day);
                const isSelected = day === selectedDay;
                
                return (
                  <button
                    key={day}
                    onClick={() => onDayChange(day)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                      isSelected
                        ? `bg-${accent}-500 text-white shadow-sm`
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <span>{dayLabels[day] || day}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isSelected 
                          ? 'bg-white bg-opacity-20' 
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {packCount}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
