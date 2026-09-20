import { fullPageValidationAddonsMethods } from '../../../app/assets/widgets/full-page/methods/validation-addons-methods';
import { ProductPageSelectionDataMethods } from '../../../app/assets/widgets/product-page/methods/selection-data-methods';
import { fullPageSelectionNavigationMethods } from '../../../app/assets/widgets/full-page/methods/selection-navigation-methods';
import { ProductPageModalStateMethods } from '../../../app/assets/widgets/product-page/methods/modal-state-methods';
import { ToastManager } from '../../../app/assets/widgets/shared/toast-manager';

describe('Active add-on tier selection limits', () => {
  test.each([['FPB',fullPageSelectionNavigationMethods],['PPB',ProductPageModalStateMethods]] as const)('%s enforces the active tier conditions on increases', (_kind, methods) => {
    const toast=jest.spyOn(ToastManager,'show').mockImplementation(()=>undefined);
    const context={...methods,selectedBundle:{steps:[{isFreeGift:true}]},selectedProducts:[{variant:1}],
      stepProductData:[[{selectionId:'variant',price:2000}]],normalizeSelectionKey:(id:unknown)=>String(id),
      getSelectedQuantity:()=>1,findProductBySelectionKey:(products:any[],id:string)=>products.find(p=>p.selectionId===id),
      _getStepConditionSelections:(_index:number,selections:object)=>selections,_getDirectDefaultSelectionQuantities:()=>({}),
      getAddonTierEvaluation:()=>({isEligible:true,tier:{conditions:[{type:'quantity',condition:'lessThanOrEqualTo',value:'1'}]}}),
      _resolveText:(_key:string,value:string)=>value,
    };
    try {
      expect(methods.validateStepCondition.call(context,0,'variant',2)).toBe(false);
      expect(methods.validateStepCondition.call(context,0,'variant',0)).toBe(true);
      expect(toast).toHaveBeenCalled();
    } finally {toast.mockRestore();}
  });
  test.each([['FPB',fullPageSelectionNavigationMethods],['PPB',ProductPageModalStateMethods]] as const)('%s allows omitting an optional add-on but validates a partial selection', (_kind, methods) => {
    const context={...methods,selectedBundle:{steps:[{isFreeGift:true}]},selectedProducts:[{variant:1}],
      stepProductData:[[{selectionId:'variant',price:2000}]],normalizeSelectionKey:(id:unknown)=>String(id),
      _getStepConditionSelections:(_index:number,selections:object)=>selections,
      getAddonTierEvaluation:()=>({isEligible:true,tier:{conditions:[{type:'quantity',condition:'equalTo',value:'2'}]}}),
    };
    expect(methods.validateStep.call(context,0)).toBe(false);
    context.selectedProducts=[{} as any]; expect(methods.validateStep.call(context,0)).toBe(true);
    context.selectedProducts=[{variant:2}]; expect(methods.validateStep.call(context,0)).toBe(true);
  });
  test.each([['FPB',fullPageValidationAddonsMethods],['PPB',ProductPageSelectionDataMethods]] as const)('%s does not let an add-on qualify its own paid-product threshold', (_kind, methods) => {
    const addon={isFreeGift:true,addonDisplayFree:false,addonTiers:[{eligibilityCondition:{type:'QUANTITY',value:2},discount:{type:'PERCENTAGE',value:50}}]};
    const context={...methods,selectedBundle:{steps:[{},addon]},selectedProducts:[{paid:1},{addon:1}],
      stepProductData:[[{selectionId:'paid',price:2000}],[{selectionId:'addon',price:2000}]],
    };
    expect(methods.getAddonTierEvaluation.call(context,addon).isEligible).toBe(false);
  });
});
