import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Brain, Heart, Leaf } from 'lucide-react';

interface EnhancedHealthImpactProps {
  benefitTags: string[];
  concernTags: string[];
  glycemicInfo?: {
    glycemicIndex?: number | string | null;
    glycemicLoad?: number | string | null;
    explanation?: string;
  };
  nutrients?: {
    name: string;
    value: string | number;
    unit: string;
    isHighlight: boolean;
    percentOfDailyValue?: number;
    amount?: number;
  }[];
  goal?: string;
  className?: string;
}

const formatNutrientValue = (value: string | number): string => {
  if (typeof value === 'string') {
    // Try to parse the string as a number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      return numValue % 1 === 0 ? numValue.toString() : numValue.toFixed(1);
    }
    return value;
  } else if (typeof value === 'number') {
    return value % 1 === 0 ? value.toString() : value.toFixed(1);
  }
  return '';
};

const isNutrientBeneficial = (name: string): boolean => {
  const beneficialNutrients = [
    'fiber', 'protein', 'vitamin', 'mineral', 'omega', 'antioxidant', 
    'calcium', 'iron', 'magnesium', 'potassium', 'zinc'
  ];
  
  return beneficialNutrients.some(nutrient => 
    name.toLowerCase().includes(nutrient.toLowerCase())
  );
};

const isNutrientConcerning = (name: string, value: string | number): boolean => {
  const nutrientName = name.toLowerCase();
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (nutrientName.includes('sugar') && numValue > 15) return true;
  if (nutrientName.includes('sodium') && numValue > 500) return true;
  if (nutrientName.includes('saturated fat') && numValue > 5) return true;
  if (nutrientName.includes('cholesterol') && numValue > 100) return true;
  if (nutrientName.includes('trans fat') && numValue > 0) return true;
  
  return false;
};

const EnhancedHealthImpact: React.FC<EnhancedHealthImpactProps> = ({
  benefitTags = [],
  concernTags = [],
  glycemicInfo,
  nutrients = [],
  goal = '',
  className = ''
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  
  // Check if we have sufficient data to show the component
  const hasBenefits = benefitTags && benefitTags.length > 0;
  const hasConcerns = concernTags && concernTags.length > 0;
  const hasNutrients = nutrients && nutrients.length > 0;
  const hasGlycemicInfo = glycemicInfo && (glycemicInfo.glycemicIndex || glycemicInfo.glycemicLoad);
  
  // Skip rendering if there's no health impact data
  if (!hasBenefits && !hasConcerns && !hasNutrients && !hasGlycemicInfo) {
    return null;
  }
  
  // Categorize health impacts
  const cognitiveImpacts: string[] = [];
  const cardiovascularImpacts: string[] = [];
  const digestiveImpacts: string[] = [];
  
  // Check for high sugar content
  const sugarNutrient = nutrients.find(n => 
    n.name.toLowerCase().includes('sugar')
  );
  
  const hasSugar = sugarNutrient && (
    typeof sugarNutrient.value === 'number' ? 
      sugarNutrient.value > 20 : 
      parseFloat(String(sugarNutrient.value)) > 20
  );
  
  // Generate impact explanations based on nutrients
  if (hasNutrients) {
    nutrients.forEach(nutrient => {
      const name = nutrient.name.toLowerCase();
      
      // Cognitive impacts
      if (name.includes('omega') || name.includes('b12') || name.includes('folate') || 
          name.includes('vitamin b') || name.includes('magnesium')) {
        if (isNutrientBeneficial(name)) {
          cognitiveImpacts.push(`${nutrient.name} supports brain function and cognitive health`);
        }
      }
      
      // Cardiovascular impacts
      if (name.includes('fiber') || name.includes('potassium') || name.includes('omega') || 
          name.includes('vitamin d') || name.includes('magnesium')) {
        if (isNutrientBeneficial(name)) {
          cardiovascularImpacts.push(`${nutrient.name} promotes heart health`);
        }
      }
      
      // Heart health concerns
      if (name.includes('sodium') || name.includes('saturated fat') || name.includes('cholesterol')) {
        if (isNutrientConcerning(name, nutrient.value)) {
          cardiovascularImpacts.push(`High ${nutrient.name} may impact heart health`);
        }
      }
      
      // Digestive impacts
      if (name.includes('fiber') || name.includes('probiotic')) {
        if (isNutrientBeneficial(name)) {
          digestiveImpacts.push(`${nutrient.name} supports digestive health`);
        }
      }
    });
  }
  
  // Handle high sugar and its implications
  if (hasSugar) {
    if (goal.toLowerCase().includes('sleep')) {
      cognitiveImpacts.push('High sugar content may affect sleep quality');
    } else if (goal.toLowerCase().includes('energy')) {
      cognitiveImpacts.push('High sugar may cause energy crashes later');
    } else {
      cognitiveImpacts.push('High sugar content may affect concentration');
    }
  }
  
  // Get glycemic impact explanation
  let glycemicExplanation = '';
  if (hasGlycemicInfo) {
    const glycemicIndex = glycemicInfo.glycemicIndex ? 
      typeof glycemicInfo.glycemicIndex === 'string' ? 
        parseFloat(glycemicInfo.glycemicIndex) : 
        glycemicInfo.glycemicIndex : 
      null;
    
    if (glycemicIndex !== null) {
      if (glycemicIndex < 55) {
        glycemicExplanation = 'Low glycemic index foods help maintain steady blood sugar and energy levels';
      } else if (glycemicIndex >= 55 && glycemicIndex <= 69) {
        glycemicExplanation = 'Medium glycemic index foods provide moderate energy release';
      } else if (glycemicIndex > 69) {
        glycemicExplanation = 'High glycemic index foods may cause blood sugar spikes and subsequent energy crashes';
      }
    } else if (glycemicInfo.explanation) {
      glycemicExplanation = glycemicInfo.explanation;
    }
  }
  
  return (
    <Card className={`mb-6 ${className}`}>
      <div className="p-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-navy text-lg flex items-center">
            <span className="text-indigo-600 mr-2">🧠</span>
            Health Impact Analysis
          </h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setExpanded(!expanded)}
            className="p-1"
          >
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </Button>
        </div>
        
        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Benefits Section */}
            {hasBenefits && (
              <div>
                <h3 className="text-md font-semibold text-green-700 mb-2 flex items-center">
                  <Leaf className="w-4 h-4 mr-2" />
                  Potential Benefits
                </h3>
                <ul className="ml-6 space-y-1">
                  {benefitTags.map((tag, idx) => (
                    <li key={`benefit-${idx}`} className="text-sm text-slate-700 list-disc">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Concerns Section */}
            {hasConcerns && (
              <div>
                <h3 className="text-md font-semibold text-amber-700 mb-2">
                  Potential Concerns
                </h3>
                <ul className="ml-6 space-y-1">
                  {concernTags.map((tag, idx) => (
                    <li key={`concern-${idx}`} className="text-sm text-slate-700 list-disc">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Cognitive Impact */}
            {cognitiveImpacts.length > 0 && (
              <div>
                <h3 className="text-md font-semibold text-indigo-700 mb-2 flex items-center">
                  <Brain className="w-4 h-4 mr-2" />
                  Cognitive Impact
                </h3>
                <ul className="ml-6 space-y-1">
                  {cognitiveImpacts.map((impact, idx) => (
                    <li key={`cognitive-${idx}`} className="text-sm text-slate-700 list-disc">
                      {impact}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Cardiovascular Impact */}
            {cardiovascularImpacts.length > 0 && (
              <div>
                <h3 className="text-md font-semibold text-rose-700 mb-2 flex items-center">
                  <Heart className="w-4 h-4 mr-2" />
                  Cardiovascular Impact
                </h3>
                <ul className="ml-6 space-y-1">
                  {cardiovascularImpacts.map((impact, idx) => (
                    <li key={`cardiovascular-${idx}`} className="text-sm text-slate-700 list-disc">
                      {impact}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Digestive Impact */}
            {digestiveImpacts.length > 0 && (
              <div>
                <h3 className="text-md font-semibold text-emerald-700 mb-2">
                  Digestive Impact
                </h3>
                <ul className="ml-6 space-y-1">
                  {digestiveImpacts.map((impact, idx) => (
                    <li key={`digestive-${idx}`} className="text-sm text-slate-700 list-disc">
                      {impact}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Glycemic Impact */}
            {glycemicExplanation && (
              <div>
                <h3 className="text-md font-semibold text-amber-700 mb-2">
                  Glycemic Impact
                </h3>
                <p className="text-sm text-slate-700 ml-6">{glycemicExplanation}</p>
                {glycemicInfo?.glycemicIndex && (
                  <p className="text-xs text-slate-500 ml-6 mt-1">
                    Glycemic Index: {glycemicInfo.glycemicIndex} 
                    {glycemicInfo.glycemicLoad && ` | Glycemic Load: ${glycemicInfo.glycemicLoad}`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        
        {!expanded && (
          <p className="text-sm text-slate-500 mt-2">
            Click to see detailed health impacts of this meal
          </p>
        )}
      </div>
    </Card>
  );
};

export default EnhancedHealthImpact; 