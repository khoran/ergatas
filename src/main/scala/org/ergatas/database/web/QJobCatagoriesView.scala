package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QJobCatagoriesView extends QJobCatagoriesView("jobCatagoriesView") {
  override def as(variable: String) = new QJobCatagoriesView(variable)

}

class QJobCatagoriesView(md: PathMetadata[_]) extends RelationalPathImpl[JobCatagoriesView](md, "web", "job_catagories_view") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val catagory = createString("catagory")

  val jobCatagoryKey = createNumber[Int]("jobCatagoryKey")

  val socGroup = createString("socGroup")

  addMetadata(catagory, ColumnMetadata.named("catagory").ofType(12).withSize(2147483647))
  addMetadata(jobCatagoryKey, ColumnMetadata.named("job_catagory_key").ofType(4).withSize(10))
  addMetadata(socGroup, ColumnMetadata.named("soc_group").ofType(12).withSize(2147483647))
}

