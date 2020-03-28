module Project where

import Expr

class Projectable a where 
    project :: a -> a

instance projExpr :: Projectable Expr where
    project ExprBottom           = ExprBottom
    project (ExprVar x)          = ExprVar x
    project ExprTrue             = ExprTrue
    project ExprFalse            = ExprFalse
    project (ExprNum n)          = ExprNum n
    project (ExprPair e1 e2)     = ExprPair (project e1) (project e2)
    project (ExprPair_Del e1 e2) = case T2 (project e1) (project e2) of
                                    T2 ExprBottom e2' ->  e2'
                                    T2 e1' ExprBottom ->  e1'
                                    _  -> ExprBottom
    project (ExprNil)           = ExprNil
    project (ExprCons e es)     = ExprCons (project e) (project es)
    project (ExprCons_Del e es) = case T2 (project e) (project es) of
                                    T2 ExprBottom es' ->  es'
                                    T2 e' ExprBottom  ->  e'
                                    _  -> ExprBottom

    project (ExprFun fun σ)        = ExprFun fun σ
    project (ExprApp e1 e2)        = ExprApp (project e1) (project e2)
    project (ExprLet x e1 e2)      = ExprLet x (project e1) (project e2)
    project (ExprLet_Body x e1 e2) = case project e1 of
                                        ExprBottom -> project e2
                                        _ -> ExprBottom
    project (ExprMatch e σ) = ExprMatch (project e) σ
    project (ExprAdd e1 e2) = ExprAdd e1 e2

instance projBranchNil :: Projectable BranchNil where 
      project (BranchNil t e)  = BranchNil t (project e)

instance projBranchCons :: Projectable BranchCons where
      project (BranchCons x xs tx e) = BranchCons x xs tx (project e)

instance projBranchTrue :: Projectable BranchTrue where
      project (BranchTrue e) = BranchTrue (project e)

instance projBranchFalse :: Projectable BranchFalse where
      project (BranchFalse e)  = BranchFalse (project e)


instance projElim :: Projectable Elim where
      project (ElimVar x tx e)         = ElimVar x tx (project e)
      project (ElimPair x tx y ty e)   = ElimPair x tx y ty (project e)
      project (ElimList bNil bCons )   = ElimList (project bNil) (project bCons)  
      project (ElimBool bTrue bFalse)  = ElimBool (project bTrue) (project bFalse)